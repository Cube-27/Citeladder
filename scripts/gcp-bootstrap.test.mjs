import assert from 'node:assert/strict';
import test from 'node:test';
import { bootstrap } from '../infra/gcp/bootstrap.mjs';

const OPTIONS = {
  projectId: 'fixture-project',
  billingAccount: '000000-FIXTURE',
  stateBucket: 'fixture-state',
  region: 'us-central1',
  zone: 'us-central1-a',
  repository: 'Cube-27/Citeladder',
  repositoryId: '1353174067',
  environment: 'gcp-demo',
};

function stubs({ existing = false, labels, operations = [{ done: true }], failOn } = {}) {
  const calls = [];
  const requests = [];
  const run = (args, mode) => {
    const command = args.join(' ');
    calls.push(command);
    if (failOn && command.startsWith(failOn)) throw new Error(`stub failure: ${failOn}`);
    if (mode === 'exists') return existing;
    if (command === 'projects describe fixture-project --format=json') {
      return JSON.stringify({ projectNumber: '123', labels });
    }
    if (command === 'auth print-access-token') return 'fixture-token';
    if (command.endsWith('--format=value(projectNumber)')) return '123';
    return true;
  };
  const fetch = async (url, init) => {
    requests.push({ url, method: init.method, body: init.body && JSON.parse(init.body) });
    return { ok: true, json: async () => ({ name: 'operations/fixture', ...operations.shift() }) };
  };
  return { calls, requests, deps: { run, fetch, wait: async () => {} } };
}

test('a fresh project is created and trusts only the deploy workflow', async () => {
  const { calls, requests, deps } = stubs({ operations: [{ done: false }, { done: true }] });
  const lines = await bootstrap(OPTIONS, deps);
  const started = (prefix) => calls.filter((call) => call.startsWith(prefix));
  assert.equal(started('projects create fixture-project').length, 1);
  assert.equal(started('storage buckets create gs://fixture-state').length, 1);
  assert.deepEqual(
    started('iam service-accounts create').map((call) => call.split(' ')[3]),
    ['citeladder-github-deploy', 'citeladder-db'],
  );
  assert.equal(started('iam roles create citeladderSecretContainers').length, 1);
  assert.equal(started('iam workload-identity-pools create github').length, 1);
  const [provider] = started('iam workload-identity-pools providers create-oidc');
  assert.match(provider, /--issuer-uri=https:\/\/token\.actions\.githubusercontent\.com$/u);
  assert.ok(
    provider.includes(
      "--attribute-condition=assertion.repository_id=='1353174067' && assertion.repository=='Cube-27/Citeladder' && assertion.job_workflow_ref=='Cube-27/Citeladder/.github/workflows/gcp-deploy.yml@refs/heads/main' && assertion.ref=='refs/heads/main' && assertion.environment=='gcp-demo'",
    ),
  );
  assert.deepEqual(
    requests.map(({ url, method }) => `${method} ${url}`),
    [
      'PATCH https://cloudresourcemanager.googleapis.com/v3/projects/123?updateMask=labels',
      'GET https://cloudresourcemanager.googleapis.com/v3/operations/fixture',
    ],
  );
  assert.deepEqual(lines, [
    'GCP_PROJECT_ID=fixture-project',
    'GCP_REGION=us-central1',
    'GCP_ZONE=us-central1-a',
    'GCP_WIF_PROVIDER=projects/123/locations/global/workloadIdentityPools/github/providers/citeladder-main',
    'GCP_DEPLOY_SERVICE_ACCOUNT=citeladder-github-deploy@fixture-project.iam.gserviceaccount.com',
    'GCP_TF_STATE_BUCKET=fixture-state',
  ]);
});

test('a rerun converges existing resources and keeps foreign labels', async () => {
  const { calls, requests, deps } = stubs({
    existing: true,
    labels: { team: 'growth', environment: 'staging' },
  });
  await bootstrap(OPTIONS, deps);
  assert.equal(calls.filter((call) => / create(-oidc)? /u.test(call)).length, 0);
  assert.equal(calls.filter((call) => call.startsWith('iam roles update')).length, 1);
  const [provider] = calls.filter((call) => call.includes('providers update-oidc'));
  assert.equal(provider.includes('--issuer-uri'), false);
  assert.deepEqual(requests[0].body, {
    labels: {
      team: 'growth',
      environment: 'production',
      project: 'citeladder',
      managed_by: 'terraform',
    },
  });
});

test('every retired role is removed and the deployer gets no project-wide storage role', async () => {
  const { calls, deps } = stubs({ existing: true });
  await bootstrap(OPTIONS, deps);
  const roles = (verb) =>
    calls
      .filter((call) => call.startsWith(`projects ${verb}-iam-policy-binding`))
      .filter((call) => call.includes('citeladder-github-deploy@'))
      .map((call) => call.match(/--role=(\S+)/u)[1]);
  assert.ok(roles('remove').includes('roles/storage.admin'));
  assert.equal(
    roles('add').some((role) => role.startsWith('roles/storage.')),
    false,
  );
  assert.ok(roles('add').includes('projects/fixture-project/roles/citeladderSecretContainers'));
});

test('a zone outside us-central1 is refused before any gcloud call', async () => {
  const { calls, deps } = stubs();
  await assert.rejects(bootstrap({ ...OPTIONS, zone: 'europe-west1-b' }, deps), /us-central1/u);
  assert.deepEqual(calls, []);
});

test('a failed step stops the bootstrap, and a failed label operation is reported', async () => {
  const failing = stubs({ failOn: 'billing projects link' });
  await assert.rejects(bootstrap(OPTIONS, failing.deps), /stub failure/u);
  assert.equal(failing.calls.at(-1).startsWith('billing projects link'), true);
  const labelError = stubs({ operations: [{ done: true, error: { message: 'denied' } }] });
  await assert.rejects(
    bootstrap(OPTIONS, labelError.deps),
    /Could not apply labels to project fixture-project: denied/u,
  );
});
