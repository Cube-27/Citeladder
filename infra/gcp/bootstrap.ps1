[CmdletBinding()]
param(
    [Parameter(Mandatory)] [string] $ProjectId,
    [Parameter(Mandatory)] [string] $BillingAccount,
    [Parameter(Mandatory)] [string] $StateBucket,
    [string] $Region = 'asia-south1',
    [string] $Repository = 'Cube-27/Citeladder',
    [string] $Environment = 'gcp-demo'
)

$ErrorActionPreference = 'Stop'
$pool = 'github'
$provider = 'citeladder-main'
$deployAccount = 'citeladder-github-deploy'

gcloud projects describe $ProjectId *> $null
if ($LASTEXITCODE -ne 0) {
    gcloud projects create $ProjectId --name='CiteLadder Demo' --labels='project=citeladder,environment=demo'
}
gcloud billing projects link $ProjectId --billing-account=$BillingAccount
gcloud config set project $ProjectId

$apis = @(
    'artifactregistry.googleapis.com',
    'billingbudgets.googleapis.com',
    'cloudbilling.googleapis.com',
    'cloudbuild.googleapis.com',
    'compute.googleapis.com',
    'iam.googleapis.com',
    'iamcredentials.googleapis.com',
    'iap.googleapis.com',
    'secretmanager.googleapis.com',
    'serviceusage.googleapis.com',
    'storage.googleapis.com',
    'sts.googleapis.com'
)
gcloud services enable @apis --project=$ProjectId

if (-not (gcloud storage buckets describe "gs://$StateBucket" --project=$ProjectId 2>$null)) {
    gcloud storage buckets create "gs://$StateBucket" --project=$ProjectId --location=$Region `
        --uniform-bucket-level-access --public-access-prevention
}
gcloud storage buckets update "gs://$StateBucket" --versioning --uniform-bucket-level-access `
    --public-access-prevention

$projectNumber = gcloud projects describe $ProjectId --format='value(projectNumber)'
$serviceAccount = "$deployAccount@$ProjectId.iam.gserviceaccount.com"
if (-not (gcloud iam service-accounts describe $serviceAccount --project=$ProjectId 2>$null)) {
    gcloud iam service-accounts create $deployAccount --project=$ProjectId `
        --display-name='CiteLadder GitHub deployer'
}

$projectRoles = @(
    'roles/artifactregistry.admin',
    'roles/compute.admin',
    'roles/compute.osAdminLogin',
    'roles/iam.serviceAccountAdmin',
    'roles/iam.serviceAccountUser',
    'roles/iap.tunnelResourceAccessor',
    'roles/resourcemanager.projectIamAdmin',
    'roles/resourcemanager.projectDeleter',
    'roles/secretmanager.admin',
    'roles/storage.admin'
)
foreach ($role in $projectRoles) {
    gcloud projects add-iam-policy-binding $ProjectId --member="serviceAccount:$serviceAccount" `
        --role=$role --condition=None --quiet *> $null
}
gcloud billing accounts add-iam-policy-binding $BillingAccount --member="serviceAccount:$serviceAccount" `
    --role='roles/billing.costsManager' --condition=None --quiet *> $null

if (-not (gcloud iam workload-identity-pools describe $pool --location=global --project=$ProjectId 2>$null)) {
    gcloud iam workload-identity-pools create $pool --location=global --project=$ProjectId `
        --display-name='GitHub Actions'
}
$condition = "assertion.repository=='$Repository' && assertion.ref=='refs/heads/main' && assertion.environment=='$Environment'"
if (-not (gcloud iam workload-identity-pools providers describe $provider --workload-identity-pool=$pool `
        --location=global --project=$ProjectId 2>$null)) {
    gcloud iam workload-identity-pools providers create-oidc $provider `
        --project=$ProjectId --location=global --workload-identity-pool=$pool `
        --issuer-uri='https://token.actions.githubusercontent.com' `
        --attribute-mapping='google.subject=assertion.sub,attribute.repository=assertion.repository,attribute.ref=assertion.ref,attribute.environment=assertion.environment' `
        --attribute-condition=$condition --display-name='Cube-27 CiteLadder main gcp-demo'
}

$principal = "principalSet://iam.googleapis.com/projects/$projectNumber/locations/global/workloadIdentityPools/$pool/attribute.repository/$Repository"
gcloud iam service-accounts add-iam-policy-binding $serviceAccount --project=$ProjectId `
    --role='roles/iam.workloadIdentityUser' --member=$principal --quiet *> $null

Write-Output "GCP_PROJECT_ID=$ProjectId"
Write-Output "GCP_PROJECT_NUMBER=$projectNumber"
Write-Output "GCP_REGION=$Region"
Write-Output 'GCP_ZONE=asia-south1-a'
Write-Output "GCP_WIF_PROVIDER=projects/$projectNumber/locations/global/workloadIdentityPools/$pool/providers/$provider"
Write-Output "GCP_DEPLOY_SERVICE_ACCOUNT=$serviceAccount"
Write-Output "GCP_TF_STATE_BUCKET=$StateBucket"
