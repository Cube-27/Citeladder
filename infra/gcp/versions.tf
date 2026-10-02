terraform {
  required_version = ">= 1.10, < 2.0"

  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 7.0"
    }
  }

  # The prefix predates the us-central1 rebuild. Keeping it lets the first
  # apply of this configuration delete the retired Mumbai resources it lists.
  backend "gcs" {
    prefix = "citeladder-demo/terraform"
  }
}
