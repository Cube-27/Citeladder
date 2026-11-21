#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';
import { parseArgs } from 'node:util';

const POOL = 'github';
const PROVIDER = 'citeladder-main';
const DEPLOY_ACCOUNT = 'citeladder-github-deploy';
const RESOURCE_MANAGER = 'https://cloudresourcemanager.googleapis.com/v3';

const APIS = [
  'artifactregistry.googleapis.com',
  'billingbudgets.googleapis.com',
  'cloudbilling.googleapis.com',
  'cloudscheduler.googleapis.com',
  'compute.googleapis.com',
  'iam.googleapis.com',
  'iamcredentials.googleapis.com',
  'iap.googleapis.com',
  'monitoring.googleapis.com',
  'pubsub.googleapis.com',
  'run.googleapis.com',
  'secretmanager.googleapis.com',
  'serviceusage.googleapis.com',
  'storage.googleapis.com',
  'sts.googleapis.com',
];

const SECRET_ROLE = 'citeladderSecretContainers';
const SECRET_PERMISSIONS = [
  'resourcemanager.projects.get',
  'secretmanager.secrets.create',
  'secretmanager.secrets.delete',
  'secretmanager.secrets.get',
  'secretmanager.secrets.getIamPolicy',
  'secretmanager.secrets.list',
  'secretmanager.secrets.setIamPolicy',
  'secretmanager.secrets.update',
].join(',');

const PROJECT_ROLES = [
  'roles/artifactregistry.admin',
  'roles/cloudscheduler.admin',
  'roles/compute.instanceAdmin.v1',
  'roles/compute.networkAdmin',
  'roles/compute.securityAdmin',
  'roles/iam.serviceAccountAdmin',
  'roles/iam.serviceAccountUser',
  'roles/logging.configWriter',
  'roles/monitoring.alertPolicyEditor',
  'roles/monitoring.notificationChannelEditor',
  'roles/monitoring.uptimeCheckConfigEditor',
  'roles/monitoring.viewer',
  'roles/run.admin',
];

const RETIRED_ROLES = [
  'roles/compute.admin',
  'roles/compute.osAdminLogin',
  'roles/containeranalysis.occurrences.viewer',
  'roles/iap.tunnelResourceAccessor',
  'roles/resourcemanager.projectDeleter',
  'roles/resourcemanager.projectIamAdmin',
  'roles/secretmanager.admin',
  'roles/storage.admin',
];

export class BootstrapError extends Error {}

export function gcloud(args, mode) {
  const stdio = {
    exists: 'ignore',
    read: ['ignore', 'pipe', 'inherit'],
    quiet: 'pipe',
    run: 'inherit',
  }[mode];
  const result = spawnSync('gcloud', args, { encoding: 'utf8', stdio }); // NOSONAR
  if (mode === 'exists') return result.status === 0;
  if (result.status !== 0) {
    if (mode === 'quiet' && result.stderr) process.stderr.write(result.stderr);
    throw new BootstrapError(`gcloud ${args.slice(0, 3).join(' ')} failed.`);
  }
  return mode === 'read' ? result.stdout.trim() : true;
}

async function setProjectLabels({ id, run, fetch, wait }) {
  const project = JSON.parse(run(['projects', 'describe', id, '--format=json'], 'read'));
  const labels = {
    ...project.labels,
    project: 'citeladder',
    environment: 'production',
    managed_by: 'terraform',
  };
  const headers = {
    Authorization: `Bearer ${run(['auth', 'print-access-token'], 'read')}`,
    'Content-Type': 'application/json',
  };
  const call = async (url, init) => {
    const response = await fetch(url, { headers, ...init });
    if (!response.ok)
      throw new BootstrapError(`Could not apply labels to project ${id}: HTTP ${response.status}`);
    return response.json();
  };
  let operation = await call(
    `${RESOURCE_MANAGER}/projects/${project.projectNumber}?updateMask=labels`,
    { method: 'PATCH', body: JSON.stringify({ labels }) },
  );
  for (let attempt = 0; !operation.done && attempt < 30; attempt++) {
    await wait(1000); // NOSONAR
    operation = await call(`${RESOURCE_MANAGER}/${operation.name}`, { method: 'GET' }); // NOSONAR
  }
  if (!operation.done)
    throw new BootstrapError(`Timed out while applying labels to project ${id}.`);
  if (operation.error) {
    throw new BootstrapError(`Could not apply labels to project ${id}: ${operation.error.message}`);
  }
}

export async function bootstrap(
  options,
  { run = gcloud, fetch = globalThis.fetch, wait = sleep } = {},
) {
  const {
    projectId,
    billingAccount,
    stateBucket,
    region,
    zone,
    repository,
    repositoryId,
    environment,
  } = options;
  if (region !== 'us-central1' || !/^us-central1-[a-z]$/u.test(zone)) {
    throw new BootstrapError(
      'The region is fixed to us-central1 (free-tier e2-micro); select a zone in that region.',
    );
  }
  const project = `--project=${projectId}`;
  if (!run(['projects', 'describe', projectId], 'exists')) {
    run(
      [
        'projects',
        'create',
        projectId,
        '--name=CiteLadder',
        '--labels=project=citeladder,environment=production,managed_by=terraform',
      ],
      'run',
    );
  }
  await setProjectLabels({ id: projectId, run, fetch, wait });
  run(['billing', 'projects', 'link', projectId, `--billing-account=${billingAccount}`], 'run');
  run(['config', 'set', 'project', projectId], 'run');
  run(['services', 'enable', ...APIS, project], 'run');

  const bucket = `gs://${stateBucket}`;
  if (!run(['storage', 'buckets', 'describe', bucket, project], 'exists')) {
    run(
      [
        'storage',
        'buckets',
        'create',
        bucket,
        project,
        `--location=${region}`,
        '--uniform-bucket-level-access',
        '--public-access-prevention',
      ],
      'run',
    );
  }
  run(
    [
      'storage',
      'buckets',
      'update',
      bucket,
      '--versioning',
      '--uniform-bucket-level-access',
      '--public-access-prevention',
    ],
    'run',
  );

  const projectNumber = run(
    ['projects', 'describe', projectId, '--format=value(projectNumber)'],
    'read',
  );
  const serviceAccount = `${DEPLOY_ACCOUNT}@${projectId}.iam.gserviceaccount.com`;
  if (!run(['iam', 'service-accounts', 'describe', serviceAccount, project], 'exists')) {
    run(
      [
        'iam',
        'service-accounts',
        'create',
        DEPLOY_ACCOUNT,
        project,
        '--display-name=CiteLadder GitHub deployer',
      ],
      'run',
    );
  }

  const roleArgs = [`--permissions=${SECRET_PERMISSIONS}`, '--stage=GA', '--quiet'];
  if (run(['iam', 'roles', 'describe', SECRET_ROLE, project], 'exists')) {
    run(['iam', 'roles', 'update', SECRET_ROLE, project, ...roleArgs], 'quiet');
  } else {
    run(
      [
        'iam',
        'roles',
        'create',
        SECRET_ROLE,
        project,
        '--title=CiteLadder secret containers',
        ...roleArgs,
      ],
      'quiet',
    );
  }

  const deployer = `--member=serviceAccount:${serviceAccount}`;
  for (const role of [...PROJECT_ROLES, `projects/${projectId}/roles/${SECRET_ROLE}`]) {
    run(
      [
        'projects',
        'add-iam-policy-binding',
        projectId,
        deployer,
        `--role=${role}`,
        '--condition=None',
        '--quiet',
      ],
      'quiet',
    );
  }
  run(
    [
      'storage',
      'buckets',
      'add-iam-policy-binding',
      bucket,
      deployer,
      '--role=roles/storage.objectAdmin',
      '--quiet',
    ],
    'quiet',
  );
  for (const role of RETIRED_ROLES) {
    run(
      [
        'projects',
        'remove-iam-policy-binding',
        projectId,
        deployer,
        `--role=${role}`,
        '--condition=None',
        '--quiet',
      ],
      'exists',
    );
  }
  run(
    [
      'billing',
      'accounts',
      'add-iam-policy-binding',
      billingAccount,
      deployer,
      '--role=roles/billing.costsManager',
      '--quiet',
    ],
    'quiet',
  );

  const dbAccount = `citeladder-db@${projectId}.iam.gserviceaccount.com`;
  if (!run(['iam', 'service-accounts', 'describe', dbAccount, project], 'exists')) {
    run(
      [
        'iam',
        'service-accounts',
        'create',
        'citeladder-db',
        project,
        '--display-name=CiteLadder PostgreSQL VM',
      ],
      'run',
    );
  }
  run(
    [
      'projects',
      'add-iam-policy-binding',
      projectId,
      `--member=serviceAccount:${dbAccount}`,
      '--role=roles/logging.logWriter',
      '--condition=None',
      '--quiet',
    ],
    'quiet',
  );

  if (
    !run(
      ['iam', 'workload-identity-pools', 'describe', POOL, '--location=global', project],
      'exists',
    )
  ) {
    run(
      [
        'iam',
        'workload-identity-pools',
        'create',
        POOL,
        '--location=global',
        project,
        '--display-name=GitHub Actions',
      ],
      'run',
    );
  }
  const deployWorkflow = `${repository}/.github/workflows/gcp-deploy.yml@refs/heads/main`;
  const condition = [
    `assertion.repository_id=='${repositoryId}'`,
    `assertion.repository=='${repository}'`,
    `assertion.job_workflow_ref=='${deployWorkflow}'`,
    "assertion.ref=='refs/heads/main'",
    `assertion.environment=='${environment}'`,
  ].join(' && ');
  const mapping = [
    'google.subject=assertion.sub',
    'attribute.repository=assertion.repository',
    'attribute.repository_id=assertion.repository_id',
    'attribute.job_workflow_ref=assertion.job_workflow_ref',
    'attribute.ref=assertion.ref',
    'attribute.environment=assertion.environment',
  ].join(',');
  const providerArgs = [
    PROVIDER,
    project,
    '--location=global',
    `--workload-identity-pool=${POOL}`,
    `--attribute-mapping=${mapping}`,
    `--attribute-condition=${condition}`,
    '--display-name=Cube-27 CiteLadder main gcp-demo',
  ];
  const providers = ['iam', 'workload-identity-pools', 'providers'];
  if (
    run(
      [
        ...providers,
        'describe',
        PROVIDER,
        `--workload-identity-pool=${POOL}`,
        '--location=global',
        project,
      ],
      'exists',
    )
  ) {
    run([...providers, 'update-oidc', ...providerArgs], 'run');
  } else {
    run(
      [
        ...providers,
        'create-oidc',
        ...providerArgs,
        '--issuer-uri=https://token.actions.githubusercontent.com',
      ],
      'run',
    );
  }

  const principal = `principalSet://iam.googleapis.com/projects/${projectNumber}/locations/global/workloadIdentityPools/${POOL}/attribute.repository/${repository}`;
  run(
    [
      'iam',
      'service-accounts',
      'add-iam-policy-binding',
      serviceAccount,
      project,
      '--role=roles/iam.workloadIdentityUser',
      `--member=${principal}`,
      '--quiet',
    ],
    'quiet',
  );

  return [
    `GCP_PROJECT_ID=${projectId}`,
    `GCP_REGION=${region}`,
    `GCP_ZONE=${zone}`,
    `GCP_WIF_PROVIDER=projects/${projectNumber}/locations/global/workloadIdentityPools/${POOL}/providers/${PROVIDER}`,
    `GCP_DEPLOY_SERVICE_ACCOUNT=${serviceAccount}`,
    `GCP_TF_STATE_BUCKET=${stateBucket}`,
  ];
}

if (import.meta.main) {
  try {
    const { values } = parseArgs({
      options: {
        'project-id': { type: 'string' },
        'billing-account': { type: 'string' },
        'state-bucket': { type: 'string' },
        region: { type: 'string', default: 'us-central1' },
        zone: { type: 'string', default: 'us-central1-a' },
        repository: { type: 'string', default: 'Cube-27/Citeladder' },
        'repository-id': { type: 'string', default: '1353174067' },
        environment: { type: 'string', default: 'gcp-demo' },
      },
    });
    for (const required of ['project-id', 'billing-account', 'state-bucket']) {
      if (!values[required]) throw new BootstrapError(`--${required} is required.`);
    }
    const lines = await bootstrap({
      projectId: values['project-id'],
      billingAccount: values['billing-account'],
      stateBucket: values['state-bucket'],
      region: values.region,
      zone: values.zone,
      repository: values.repository,
      repositoryId: values['repository-id'],
      environment: values.environment,
    });
    process.stdout.write(`${lines.join('\n')}\n`);
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
