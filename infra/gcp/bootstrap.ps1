[CmdletBinding()]
#Requires -Version 7.3
param(
    [Parameter(Mandatory)] [string] $ProjectId,
    [Parameter(Mandatory)] [string] $BillingAccount,
    [Parameter(Mandatory)] [string] $StateBucket,
    [string] $Region = 'us-central1',
    [string] $Zone = 'us-central1-a',
    [string] $Repository = 'Cube-27/Citeladder',
    # GitHub's immutable repository ID: a deleted and re-created repository
    # with the same name cannot inherit the trust.
    [string] $RepositoryId = '1353174067',
    [string] $Environment = 'gcp-demo'
)

$ErrorActionPreference = 'Stop'
$PSNativeCommandUseErrorActionPreference = $true
if ($Region -ne 'us-central1' -or $Zone -notmatch '^us-central1-[a-z]$') {
    throw 'The region is fixed to us-central1 (free-tier e2-micro); select a zone in that region.'
}
$pool = 'github'
$provider = 'citeladder-main'
$deployAccount = 'citeladder-github-deploy'

function Test-GcloudResource {
    param([Parameter(Mandatory)] [scriptblock] $Command)

    $previousErrorAction = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    try {
        & $Command *> $null
        return $LASTEXITCODE -eq 0
    }
    finally {
        $ErrorActionPreference = $previousErrorAction
    }
}

function Set-ProjectLabels {
    param([Parameter(Mandatory)] [string] $Id)

    $project = gcloud projects describe $Id --format=json | ConvertFrom-Json
    $labels = @{}
    if ($null -ne $project.labels) {
        foreach ($property in $project.labels.psobject.Properties) {
            $labels[$property.Name] = $property.Value
        }
    }
    $labels['project'] = 'citeladder'
    $labels['environment'] = 'production'
    $labels['managed_by'] = 'terraform'

    $headers = @{ Authorization = "Bearer $(gcloud auth print-access-token)" }
    $uri = "https://cloudresourcemanager.googleapis.com/v3/projects/$($project.projectNumber)?updateMask=labels"
    $operation = Invoke-RestMethod -Method Patch -Uri $uri -Headers $headers `
        -ContentType 'application/json' -Body (@{ labels = $labels } | ConvertTo-Json -Compress)
    for ($attempt = 0; -not $operation.done -and $attempt -lt 30; $attempt++) {
        Start-Sleep -Seconds 1
        $operation = Invoke-RestMethod -Method Get `
            -Uri "https://cloudresourcemanager.googleapis.com/v3/$($operation.name)" `
            -Headers $headers
    }
    if (-not $operation.done) {
        throw "Timed out while applying labels to project $Id."
    }
    if ($null -ne $operation.error) {
        throw "Could not apply labels to project ${Id}: $($operation.error.message)"
    }
}

if (-not (Test-GcloudResource { gcloud projects describe $ProjectId })) {
    gcloud projects create $ProjectId --name='CiteLadder' --labels='project=citeladder,environment=production,managed_by=terraform'
}
Set-ProjectLabels -Id $ProjectId
gcloud billing projects link $ProjectId --billing-account=$BillingAccount
gcloud config set project $ProjectId

$apis = @(
    'artifactregistry.googleapis.com',
    'billingbudgets.googleapis.com',
    'cloudbilling.googleapis.com',
    'cloudscheduler.googleapis.com',
    'compute.googleapis.com',
    'iam.googleapis.com',
    'iamcredentials.googleapis.com',
    # The owner's break-glass database shell and tunnel; the deployer never uses it.
    'iap.googleapis.com',
    # The uptime check, alert policies and their email channel (monitoring.tf).
    'monitoring.googleapis.com',
    # The crawl-log reader pulls customers' subscriptions with this project's identity.
    'pubsub.googleapis.com',
    'run.googleapis.com',
    'secretmanager.googleapis.com',
    'serviceusage.googleapis.com',
    'storage.googleapis.com',
    'sts.googleapis.com'
)
gcloud services enable @apis --project=$ProjectId

if (-not (Test-GcloudResource { gcloud storage buckets describe "gs://$StateBucket" --project=$ProjectId })) {
    gcloud storage buckets create "gs://$StateBucket" --project=$ProjectId --location=$Region `
        --uniform-bucket-level-access --public-access-prevention
}
gcloud storage buckets update "gs://$StateBucket" --versioning --uniform-bucket-level-access `
    --public-access-prevention

$projectNumber = gcloud projects describe $ProjectId --format='value(projectNumber)'
$serviceAccount = "$deployAccount@$ProjectId.iam.gserviceaccount.com"
if (-not (Test-GcloudResource { gcloud iam service-accounts describe $serviceAccount --project=$ProjectId })) {
    gcloud iam service-accounts create $deployAccount --project=$ProjectId `
        --display-name='CiteLadder GitHub deployer'
}

# Secret containers and their IAM only: no payload reads and no version
# writes. Terraform grants the deployer accessor and version-manager roles on
# each CiteLadder secret it declares (identity.tf).
$secretRole = 'citeladderSecretContainers'
$secretPermissions = @(
    'resourcemanager.projects.get',
    'secretmanager.secrets.create',
    'secretmanager.secrets.delete',
    'secretmanager.secrets.get',
    'secretmanager.secrets.getIamPolicy',
    'secretmanager.secrets.list',
    'secretmanager.secrets.setIamPolicy',
    'secretmanager.secrets.update'
) -join ','
if (Test-GcloudResource { gcloud iam roles describe $secretRole --project=$ProjectId }) {
    gcloud iam roles update $secretRole --project=$ProjectId --permissions=$secretPermissions `
        --stage=GA --quiet *> $null
}
else {
    gcloud iam roles create $secretRole --project=$ProjectId --title='CiteLadder secret containers' `
        --permissions=$secretPermissions --stage=GA --quiet *> $null
}

$projectRoles = @(
    'roles/artifactregistry.admin',
    'roles/cloudscheduler.admin',
    # The database VM and its boot disk.
    'roles/compute.instanceAdmin.v1',
    # The VPC, subnet and the database's internal address.
    'roles/compute.networkAdmin',
    # The PostgreSQL and IAP-SSH firewall rules.
    'roles/compute.securityAdmin',
    'roles/iam.serviceAccountAdmin',
    'roles/iam.serviceAccountUser',
    # Terraform manages the API request-log exclusion and the log-based metrics.
    'roles/logging.configWriter',
    # The uptime check, alert policies and email channel (monitoring.tf).
    'roles/monitoring.alertPolicyEditor',
    'roles/monitoring.notificationChannelEditor',
    'roles/monitoring.uptimeCheckConfigEditor',
    # Reads the metric descriptors those policies name.
    'roles/monitoring.viewer',
    # Deploys services/jobs and executes migration and smoke executions.
    'roles/run.admin',
    "projects/$ProjectId/roles/$secretRole"
)
foreach ($role in $projectRoles) {
    gcloud projects add-iam-policy-binding $ProjectId --member="serviceAccount:$serviceAccount" `
        --role=$role --condition=None --quiet *> $null
}
# Terraform state only: the deployer holds no project-wide storage role.
gcloud storage buckets add-iam-policy-binding "gs://$StateBucket" --member="serviceAccount:$serviceAccount" `
    --role='roles/storage.objectAdmin' --quiet *> $null
# The project is reused across rebuilds and never deleted by automation; the
# VM deployer's SSH/IAP and project-deletion grants are retired. The deployer
# never edits project IAM, and its project-wide compute, secret and storage
# administration is replaced by the narrower grants above.
$retiredRoles = @(
    'roles/compute.admin',
    'roles/compute.osAdminLogin',
    'roles/containeranalysis.occurrences.viewer',
    'roles/iap.tunnelResourceAccessor',
    'roles/resourcemanager.projectDeleter',
    'roles/resourcemanager.projectIamAdmin',
    'roles/secretmanager.admin',
    'roles/storage.admin'
)
foreach ($role in $retiredRoles) {
    if (Test-GcloudResource {
            gcloud projects remove-iam-policy-binding $ProjectId --member="serviceAccount:$serviceAccount" `
                --role=$role --condition=None --quiet
        }) {
        Write-Verbose "Removed retired role $role"
    }
}
gcloud billing accounts add-iam-policy-binding $BillingAccount --member="serviceAccount:$serviceAccount" `
    --role='roles/billing.costsManager' --quiet *> $null

# The database VM's only project role, granted here because the deployer
# cannot edit project IAM. Terraform adopts the account (identity.tf).
$dbAccount = "citeladder-db@$ProjectId.iam.gserviceaccount.com"
if (-not (Test-GcloudResource { gcloud iam service-accounts describe $dbAccount --project=$ProjectId })) {
    gcloud iam service-accounts create 'citeladder-db' --project=$ProjectId `
        --display-name='CiteLadder PostgreSQL VM'
}
gcloud projects add-iam-policy-binding $ProjectId --member="serviceAccount:$dbAccount" `
    --role='roles/logging.logWriter' --condition=None --quiet *> $null

if (-not (Test-GcloudResource { gcloud iam workload-identity-pools describe $pool --location=global --project=$ProjectId })) {
    gcloud iam workload-identity-pools create $pool --location=global --project=$ProjectId `
        --display-name='GitHub Actions'
}
# Only the deploy workflow, from main, in the protected environment, of this
# exact repository: no other workflow in the repository can obtain credentials.
$deployWorkflow = "$Repository/.github/workflows/gcp-deploy.yml@refs/heads/main"
$condition = @(
    "assertion.repository_id=='$RepositoryId'",
    "assertion.repository=='$Repository'",
    "assertion.job_workflow_ref=='$deployWorkflow'",
    "assertion.ref=='refs/heads/main'",
    "assertion.environment=='$Environment'"
) -join ' && '
$mapping = @(
    'google.subject=assertion.sub',
    'attribute.repository=assertion.repository',
    'attribute.repository_id=assertion.repository_id',
    'attribute.job_workflow_ref=assertion.job_workflow_ref',
    'attribute.ref=assertion.ref',
    'attribute.environment=assertion.environment'
) -join ','
$providerArgs = @(
    $provider, "--project=$ProjectId", '--location=global', "--workload-identity-pool=$pool",
    "--attribute-mapping=$mapping", "--attribute-condition=$condition",
    '--display-name=Cube-27 CiteLadder main gcp-demo'
)
if (Test-GcloudResource {
        gcloud iam workload-identity-pools providers describe $provider --workload-identity-pool=$pool `
            --location=global --project=$ProjectId
    }) {
    # Re-running the bootstrap converges an existing provider to this trust.
    gcloud iam workload-identity-pools providers update-oidc @providerArgs
}
else {
    gcloud iam workload-identity-pools providers create-oidc @providerArgs `
        --issuer-uri='https://token.actions.githubusercontent.com'
}

$principal = "principalSet://iam.googleapis.com/projects/$projectNumber/locations/global/workloadIdentityPools/$pool/attribute.repository/$Repository"
gcloud iam service-accounts add-iam-policy-binding $serviceAccount --project=$ProjectId `
    --role='roles/iam.workloadIdentityUser' --member=$principal --quiet *> $null

Write-Output "GCP_PROJECT_ID=$ProjectId"
Write-Output "GCP_REGION=$Region"
Write-Output "GCP_ZONE=$Zone"
Write-Output "GCP_WIF_PROVIDER=projects/$projectNumber/locations/global/workloadIdentityPools/$pool/providers/$provider"
Write-Output "GCP_DEPLOY_SERVICE_ACCOUNT=$serviceAccount"
Write-Output "GCP_TF_STATE_BUCKET=$StateBucket"
