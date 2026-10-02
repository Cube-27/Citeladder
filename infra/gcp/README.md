# Google Cloud infrastructure

The owner procedure is [`docs/operations/GCP_RUNBOOK.md`](../../docs/operations/GCP_RUNBOOK.md).

This directory owns the scale-to-zero production environment in `us-central1`.
The GCP project is reused; nothing here creates or deletes it.

| File | Owns |
|---|---|
| `network.tf` | Private VPC/subnet (Private Google Access), the database's fixed internal address, PostgreSQL and IAP-SSH firewall rules |
| `database.tf`, `postgres-vm.sh` | Free-tier `e2-micro` Container-Optimized OS VM, no public address, running only PostgreSQL 16 from Artifact Registry |
| `postgres/Dockerfile` | Digest pin of the PostgreSQL image the deploy mirrors into Artifact Registry |
| `run.tf` | Cloud Run API service (min 0, max 2), runner/tick/migrate jobs and the Cloud Scheduler tick |
| `identity.tf` | Database, runtime and scheduler service accounts and their least-privilege grants |
| `registry.tf` | Artifact Registry with a cleanup policy, and the Secret Manager containers |
| `budget.tf` | Monthly budget alert, including a forecast rule |

Terraform state lives in the bootstrap state bucket under the historic
`citeladder-demo/terraform` prefix. Terraform declares secret containers only.
The deploy workflow adds secret values through stdin, so payloads never enter
state, arguments or logs. Cloud Run reads them by reference.

Data lives on the database VM's boot disk. Replacing the VM is the explicit,
irreversible database reset. No backups are kept.

`bootstrap.ps1` runs once per workstation-authorised setup. It enables APIs,
creates the state bucket and the deploy identity, and establishes the exact
GitHub OIDC trust for `Cube-27/Citeladder`, `refs/heads/main` and the
`gcp-demo` environment.
