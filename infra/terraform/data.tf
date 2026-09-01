resource "aws_ecr_repository" "backend" {
  name                 = "citeladder-demo-backend"
  image_tag_mutability = "IMMUTABLE"
  force_delete         = true
  image_scanning_configuration { scan_on_push = true }
}

resource "aws_ecr_repository" "frontend" {
  name                 = "citeladder-demo-frontend"
  image_tag_mutability = "IMMUTABLE"
  force_delete         = true
  image_scanning_configuration { scan_on_push = true }
}

resource "aws_secretsmanager_secret" "runtime" {
  name                    = "citeladder/demo/runtime"
  recovery_window_in_days = 0
}

resource "aws_cloudwatch_log_group" "demo" {
  name              = "/ecs/citeladder-demo"
  retention_in_days = 7
}

resource "aws_ssm_parameter" "expires_at" {
  name  = "/citeladder/demo/expires-at"
  type  = "String"
  value = var.demo_expires_at

  lifecycle {
    ignore_changes = [value]
  }
}
