data "google_project" "demo" {
  project_id = var.project_id
}

resource "google_billing_budget" "demo" {
  billing_account = var.billing_account
  display_name    = "CiteLadder seven-day demo"

  budget_filter {
    projects = ["projects/${data.google_project.demo.number}"]
  }

  amount {
    specified_amount {
      currency_code = "USD"
      units         = "25"
    }
  }

  threshold_rules {
    threshold_percent = 0.5
  }
  threshold_rules {
    threshold_percent = 0.9
  }
  threshold_rules {
    threshold_percent = 1.0
  }
}
