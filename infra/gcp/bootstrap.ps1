[CmdletBinding()]
#Requires -Version 7.3
param(
    [Parameter(Mandatory)] [string] $ProjectId,
    [Parameter(Mandatory)] [string] $BillingAccount,
    [Parameter(Mandatory)] [string] $StateBucket,
    [string] $Region = 'asia-south1',
    [string] $Zone = 'asia-south1-a',
    [string] $Repository = 'Cube-27/Citeladder',
    [string] $Environment = 'gcp-demo'
)

$ErrorActionPreference = 'Stop'
$PSNativeCommandUseErrorActionPreference = $true
if ($Region -ne 'asia-south1' -or $Zone -ne 'asia-south1-a') {
    throw 'The reviewed demo location is fixed to asia-south1/asia-south1-a.'
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
    $labels['environment'] = 'demo'
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
    gcloud projects create $ProjectId --name='CiteLadder Demo' --labels='project=citeladder,environment=demo,managed_by=terraform'
}
Set-ProjectLabels -Id $ProjectId
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
    --role='roles/billing.costsManager' --quiet *> $null

if (-not (Test-GcloudResource { gcloud iam workload-identity-pools describe $pool --location=global --project=$ProjectId })) {
    gcloud iam workload-identity-pools create $pool --location=global --project=$ProjectId `
        --display-name='GitHub Actions'
}
$condition = "assertion.repository=='$Repository' && assertion.ref=='refs/heads/main' && assertion.environment=='$Environment'"
if (-not (Test-GcloudResource {
            gcloud iam workload-identity-pools providers describe $provider --workload-identity-pool=$pool `
                --location=global --project=$ProjectId
        })) {
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
Write-Output "GCP_ZONE=$Zone"
Write-Output "GCP_WIF_PROVIDER=projects/$projectNumber/locations/global/workloadIdentityPools/$pool/providers/$provider"
Write-Output "GCP_DEPLOY_SERVICE_ACCOUNT=$serviceAccount"
Write-Output "GCP_TF_STATE_BUCKET=$StateBucket"
