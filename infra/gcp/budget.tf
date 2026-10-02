data "google_project" "current" {
  project_id = var.project_id
}

# Fixed hosting target: under the monthly amount, excluding provider usage. The
# forecast rule raises the alarm early when the daily run rate would exceed it.
resource "google_billing_budget" "monthly" {
  billing_account = var.billing_account
  display_name    = "CiteLadder monthly hosting"

  budget_filter {
    projects        = ["projects/${data.google_project.current.number}"]
    calendar_period = "MONTH"
  }

  amount {
    specified_amount {
      currency_code = var.budget_currency_code
      units         = tostring(var.budget_units)
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
  threshold_rules {
    threshold_percent = 1.0
    spend_basis       = "FORECASTED_SPEND"
  }
}
