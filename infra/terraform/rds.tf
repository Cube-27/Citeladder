resource "aws_db_subnet_group" "demo" {
  name       = local.name
  subnet_ids = aws_subnet.private[*].id
}

resource "aws_db_instance" "demo" {
  identifier                      = local.name
  engine                          = "postgres"
  engine_version                  = "16"
  instance_class                  = "db.t4g.micro"
  allocated_storage               = 20
  storage_type                    = "gp3"
  storage_encrypted               = true
  db_name                         = "citeladder"
  username                        = "citeladder"
  manage_master_user_password     = true
  db_subnet_group_name            = aws_db_subnet_group.demo.name
  vpc_security_group_ids          = [aws_security_group.rds.id]
  publicly_accessible             = false
  multi_az                        = false
  backup_retention_period         = 0
  deletion_protection             = false
  skip_final_snapshot             = true
  delete_automated_backups        = true
  auto_minor_version_upgrade      = true
  apply_immediately               = true
  performance_insights_enabled    = false
  enabled_cloudwatch_logs_exports = ["postgresql"]
}
