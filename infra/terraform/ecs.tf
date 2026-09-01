resource "aws_ecs_cluster" "demo" {
  name = local.name
  setting {
    name  = "containerInsights"
    value = "enabled"
  }
}

locals {
  migrate_container = {
    name             = "migrate"
    image            = var.backend_image
    essential        = false
    entryPoint       = ["/bin/sh", "-c"]
    command          = ["alembic upgrade head && python -m app.demo.bootstrap"]
    environment      = local.backend_environment
    secrets          = local.migrate_secrets
    logConfiguration = local.log_configuration
  }

  api_container = {
    name        = "api"
    image       = var.backend_image
    essential   = true
    command     = ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
    environment = local.backend_environment
    secrets     = local.core_secrets
    dependsOn   = [{ containerName = "migrate", condition = "SUCCESS" }]
    healthCheck = {
      command     = ["CMD-SHELL", "python -c \"import urllib.request,sys;sys.exit(0 if urllib.request.urlopen('http://127.0.0.1:8000/ready').status==200 else 1)\""]
      interval    = 15
      timeout     = 5
      retries     = 5
      startPeriod = 20
    }
    logConfiguration = local.log_configuration
  }

  frontend_container = {
    name      = "frontend"
    image     = var.frontend_image
    essential = true
    environment = [
      { name = "NODE_ENV", value = "production" },
      { name = "BACKEND_ORIGIN", value = "http://127.0.0.1:8000" },
      { name = "CITELADDER_TASK_LOCAL_BACKEND", value = "true" },
      { name = "NEXT_PUBLIC_SITE_URL", value = "https://${var.domain_name}" },
      { name = "NEXT_PUBLIC_DEMO_MODE", value = "true" },
    ]
    portMappings = [{ containerPort = 3000, hostPort = 3000, protocol = "tcp" }]
    dependsOn    = [{ containerName = "api", condition = "HEALTHY" }]
    healthCheck = {
      command     = ["CMD-SHELL", "node -e \"fetch('http://127.0.0.1:3000/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))\""]
      interval    = 15
      timeout     = 5
      retries     = 5
      startPeriod = 20
    }
    logConfiguration = local.log_configuration
  }

  worker_containers = [for name, command in local.worker_commands : {
    name             = name
    image            = var.backend_image
    essential        = true
    command          = command
    environment      = local.backend_environment
    secrets          = local.core_secrets
    dependsOn        = [{ containerName = "migrate", condition = "SUCCESS" }]
    logConfiguration = local.log_configuration
  }]
}

resource "aws_ecs_task_definition" "demo" {
  family                   = local.name
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = tostring(var.task_cpu)
  memory                   = tostring(var.task_memory)
  execution_role_arn       = aws_iam_role.ecs_execution.arn
  container_definitions    = jsonencode(concat([local.migrate_container, local.api_container, local.frontend_container], local.worker_containers))

  runtime_platform {
    operating_system_family = "LINUX"
    cpu_architecture        = "X86_64"
  }
}

resource "aws_ecs_service" "demo" {
  name                               = local.name
  cluster                            = aws_ecs_cluster.demo.id
  task_definition                    = aws_ecs_task_definition.demo.arn
  desired_count                      = var.desired_count
  launch_type                        = "FARGATE"
  platform_version                   = "LATEST"
  health_check_grace_period_seconds  = 120
  deployment_minimum_healthy_percent = 0
  deployment_maximum_percent         = 100
  enable_execute_command             = false
  wait_for_steady_state              = true

  network_configuration {
    subnets          = aws_subnet.public[*].id
    security_groups  = [aws_security_group.ecs.id]
    assign_public_ip = true
  }

  load_balancer {
    target_group_arn = aws_lb_target_group.frontend.arn
    container_name   = "frontend"
    container_port   = 3000
  }

  depends_on = [aws_lb_listener.https]
}
