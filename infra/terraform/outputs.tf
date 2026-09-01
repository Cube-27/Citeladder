output "account_id" {
  value = data.aws_caller_identity.current.account_id
}

output "alb_dns_name" {
  value = aws_lb.demo.dns_name
}

output "alb_security_group_id" {
  value = aws_security_group.alb.id
}

output "certificate_arn" {
  value = aws_acm_certificate.site.arn
}

output "certificate_validation_records" {
  value = [for option in aws_acm_certificate.site.domain_validation_options : {
    name  = option.resource_record_name
    type  = option.resource_record_type
    value = option.resource_record_value
  }]
}

output "ecs_cluster_name" {
  value = aws_ecs_cluster.demo.name
}

output "ecs_service_name" {
  value = aws_ecs_service.demo.name
}

output "rds_identifier" {
  value = aws_db_instance.demo.identifier
}

output "rds_endpoint" {
  value = aws_db_instance.demo.address
}

output "rds_master_secret_arn" {
  value = aws_db_instance.demo.master_user_secret[0].secret_arn
}

output "runtime_secret_arn" {
  value = aws_secretsmanager_secret.runtime.arn
}

output "backend_repository_url" {
  value = aws_ecr_repository.backend.repository_url
}

output "frontend_repository_url" {
  value = aws_ecr_repository.frontend.repository_url
}

output "demo_url" {
  value = "https://${var.domain_name}"
}

output "demo_expires_at" {
  value = var.demo_expires_at
}
