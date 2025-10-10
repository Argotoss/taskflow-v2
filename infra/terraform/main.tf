provider "aws" {
  region = var.aws_region
}

data "aws_availability_zones" "available" {
  state = "available"
}

locals {
  name                 = "${var.project_name}-${var.environment}"
  subnet_zones         = slice(data.aws_availability_zones.available.names, 0, length(var.public_subnet_cidrs))
  private_subnet_zones = slice(data.aws_availability_zones.available.names, 0, length(var.private_subnet_cidrs))

  common_tags = merge(
    {
      Project     = var.project_name
      Environment = var.environment
      ManagedBy   = "terraform"
    },
    var.tags
  )
}

resource "aws_ecr_repository" "api" {
  name = "${local.name}-api"

  image_scanning_configuration {
    scan_on_push = true
  }

  encryption_configuration {
    encryption_type = "AES256"
  }

  tags = local.common_tags
}

resource "aws_cloudwatch_log_group" "api" {
  name              = "/ecs/${local.name}-api"
  retention_in_days = 14
  tags              = local.common_tags
}

resource "aws_vpc" "main" {
  cidr_block           = var.cidr_block
  enable_dns_support   = true
  enable_dns_hostnames = true

  tags = merge(local.common_tags, { Name = "${local.name}-vpc" })
}

resource "aws_internet_gateway" "gw" {
  vpc_id = aws_vpc.main.id

  tags = merge(local.common_tags, { Name = "${local.name}-igw" })
}

resource "aws_route_table" "public" {
  vpc_id = aws_vpc.main.id

  route {
    cidr_block = "0.0.0.0/0"
    gateway_id = aws_internet_gateway.gw.id
  }

  tags = merge(local.common_tags, { Name = "${local.name}-public-rt" })
}

resource "aws_subnet" "public" {
  count             = length(var.public_subnet_cidrs)
  vpc_id            = aws_vpc.main.id
  cidr_block        = var.public_subnet_cidrs[count.index]
  availability_zone = local.subnet_zones[count.index]
  map_public_ip_on_launch = true

  tags = merge(local.common_tags, { Name = "${local.name}-public-${count.index + 1}" })
}

resource "aws_subnet" "private" {
  count             = length(var.private_subnet_cidrs)
  vpc_id            = aws_vpc.main.id
  cidr_block        = var.private_subnet_cidrs[count.index]
  availability_zone = local.private_subnet_zones[count.index]
  map_public_ip_on_launch = false

  tags = merge(local.common_tags, { Name = "${local.name}-private-${count.index + 1}" })
}

resource "aws_route_table_association" "public" {
  count          = length(aws_subnet.public)
  subnet_id      = aws_subnet.public[count.index].id
  route_table_id = aws_route_table.public.id
}

resource "aws_route_table_association" "private" {
  count          = length(aws_subnet.private)
  subnet_id      = aws_subnet.private[count.index].id
  route_table_id = aws_route_table.public.id
}

resource "aws_security_group" "alb" {
  name        = "${local.name}-alb-sg"
  description = "Allow inbound HTTP traffic"
  vpc_id      = aws_vpc.main.id

  ingress {
    from_port   = 80
    to_port     = 80
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = merge(local.common_tags, { Name = "${local.name}-alb-sg" })
}

resource "aws_security_group" "service" {
  name        = "${local.name}-service-sg"
  description = "Allow traffic from load balancer"
  vpc_id      = aws_vpc.main.id

  ingress {
    from_port       = var.container_port
    to_port         = var.container_port
    protocol        = "tcp"
    security_groups = [aws_security_group.alb.id]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = merge(local.common_tags, { Name = "${local.name}-service-sg" })
}

resource "aws_security_group" "database" {
  name        = "${local.name}-database-sg"
  description = "Allow database access from ECS tasks"
  vpc_id      = aws_vpc.main.id

  ingress {
    from_port       = 5432
    to_port         = 5432
    protocol        = "tcp"
    security_groups = [aws_security_group.service.id]
  }

  ingress {
    description = "Allow migrations from CI"
    from_port   = 5432
    to_port     = 5432
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = merge(local.common_tags, { Name = "${local.name}-database-sg" })
}

resource "aws_security_group" "cache" {
  name        = "${local.name}-cache-sg"
  description = "Allow redis access from ECS tasks"
  vpc_id      = aws_vpc.main.id

  ingress {
    from_port       = 6379
    to_port         = 6379
    protocol        = "tcp"
    security_groups = [aws_security_group.service.id]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = merge(local.common_tags, { Name = "${local.name}-cache-sg" })
}

resource "aws_lb" "api" {
  name               = "${local.name}-alb"
  load_balancer_type = "application"
  security_groups    = [aws_security_group.alb.id]
  subnets            = aws_subnet.public[*].id

  tags = local.common_tags
}

resource "aws_lb_target_group" "api" {
  name        = "${local.name}-tg"
  port        = var.container_port
  protocol    = "HTTP"
  vpc_id      = aws_vpc.main.id
  target_type = "ip"

  health_check {
    path                = var.health_check_path
    port                = "traffic-port"
    healthy_threshold   = 2
    unhealthy_threshold = 5
    interval            = 30
    timeout             = 5
  }

  tags = local.common_tags
}

resource "aws_lb_listener" "http" {
  load_balancer_arn = aws_lb.api.arn
  port              = 80
  protocol          = "HTTP"

  default_action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.api.arn
  }
}

resource "random_password" "database" {
  length           = 32
  special          = true
  override_special = "!@#%^*()-_=+"
}

resource "random_password" "cache" {
  length  = 32
  special = false
}

resource "aws_db_subnet_group" "main" {
  name       = "${local.name}-db-subnets"
  subnet_ids = aws_subnet.private[*].id

  tags = local.common_tags
}

resource "aws_db_instance" "postgres" {
  identifier              = "${local.name}-postgres"
  engine                  = "postgres"
  instance_class          = "db.t3.micro"
  allocated_storage       = 20
  storage_type            = "gp3"
  username                = var.db_username
  password                = random_password.database.result
  db_subnet_group_name    = aws_db_subnet_group.main.name
  vpc_security_group_ids  = [aws_security_group.database.id]
  publicly_accessible     = true
  skip_final_snapshot     = true
  deletion_protection     = false
  backup_retention_period = 1
  max_allocated_storage   = 100

  tags = local.common_tags
}

resource "aws_secretsmanager_secret" "database" {
  name = "${local.name}/database"

  tags = local.common_tags
}

resource "aws_secretsmanager_secret_version" "database" {
  secret_id     = aws_secretsmanager_secret.database.id
  secret_string = jsonencode({
    username = var.db_username
    password = random_password.database.result
    host     = aws_db_instance.postgres.address
    port     = 5432
    database = "postgres"
  })
}

resource "aws_elasticache_subnet_group" "main" {
  name       = "${local.name}-cache-subnets"
  subnet_ids = aws_subnet.private[*].id

  tags = local.common_tags
}

resource "aws_elasticache_replication_group" "redis" {
  replication_group_id          = "${local.name}-redis"
  description                   = "Redis cache for ${local.name}"
  node_type                     = var.redis_node_type
  num_cache_clusters            = 1
  automatic_failover_enabled    = false
  multi_az_enabled              = false
  engine                        = "redis"
  engine_version                = "7.1"
  port                          = 6379
  transit_encryption_enabled    = true
  auth_token                    = random_password.cache.result
  maintenance_window            = "sun:06:00-sun:07:00"
  security_group_ids            = [aws_security_group.cache.id]
  subnet_group_name             = aws_elasticache_subnet_group.main.name

  tags = local.common_tags
}

resource "aws_secretsmanager_secret" "cache" {
  name = "${local.name}/cache"

  tags = local.common_tags
}

resource "aws_secretsmanager_secret_version" "cache" {
  secret_id     = aws_secretsmanager_secret.cache.id
  secret_string = jsonencode({
    host     = aws_elasticache_replication_group.redis.primary_endpoint_address
    port     = aws_elasticache_replication_group.redis.port
    password = random_password.cache.result
  })
}

resource "aws_s3_bucket" "attachments" {
  bucket = "${local.name}-attachments"

  tags = merge(local.common_tags, { Name = "${local.name}-attachments" })
}

resource "aws_s3_bucket_lifecycle_configuration" "attachments" {
  bucket = aws_s3_bucket.attachments.id

  rule {
    id     = "abort-multipart"
    status = "Enabled"

    filter {
      prefix = ""
    }

    abort_incomplete_multipart_upload {
      days_after_initiation = 7
    }
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "attachments" {
  bucket = aws_s3_bucket.attachments.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "aws:kms"
    }
  }
}

resource "aws_s3_bucket_public_access_block" "attachments" {
  bucket                  = aws_s3_bucket.attachments.id
  block_public_acls       = var.s3_block_public_access
  block_public_policy     = var.s3_block_public_access
  ignore_public_acls      = var.s3_block_public_access
  restrict_public_buckets = var.s3_block_public_access
}

resource "aws_s3_bucket_policy" "attachments" {
  bucket = aws_s3_bucket.attachments.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = var.s3_enforce_tls ? [
      {
        Sid       = "EnforceTLS"
        Effect    = "Deny"
        Principal = "*"
        Action    = "s3:*"
        Resource = [
          aws_s3_bucket.attachments.arn,
          "${aws_s3_bucket.attachments.arn}/*"
        ]
        Condition = {
          Bool = {
            "aws:SecureTransport" = "false"
          }
        }
      }
    ] : []
  })
}

data "aws_iam_policy_document" "attachments" {
  statement {
    sid     = "AllowS3Access"
    actions = [
      "s3:GetObject",
      "s3:PutObject",
      "s3:DeleteObject",
      "s3:ListBucket"
    ]

    resources = [
      aws_s3_bucket.attachments.arn,
      "${aws_s3_bucket.attachments.arn}/*"
    ]
  }
}

resource "aws_iam_policy" "attachments" {
  name        = "${local.name}-attachments"
  description = "Allow ECS tasks to interact with the attachment bucket"
  policy      = data.aws_iam_policy_document.attachments.json

  tags = local.common_tags
}

resource "aws_iam_role_policy_attachment" "attachments" {
  role       = aws_iam_role.task_execution.name
  policy_arn = aws_iam_policy.attachments.arn
}

resource "aws_secretsmanager_secret" "attachments" {
  name = "${local.name}/attachments"

  tags = local.common_tags
}

resource "aws_secretsmanager_secret_version" "attachments" {
  secret_id     = aws_secretsmanager_secret.attachments.id
  secret_string = jsonencode({
    bucket = aws_s3_bucket.attachments.bucket
    region = var.aws_region
  })
}

resource "aws_ecs_cluster" "main" {
  name = "${local.name}-cluster"

  setting {
    name  = "containerInsights"
    value = "enabled"
  }

  tags = local.common_tags
}

data "aws_iam_policy_document" "task_execution_assume_role" {
  statement {
    actions = ["sts:AssumeRole"]

    principals {
      type        = "Service"
      identifiers = ["ecs-tasks.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "task_execution" {
  name               = "${local.name}-task-execution-role"
  assume_role_policy = data.aws_iam_policy_document.task_execution_assume_role.json
  tags               = local.common_tags
}

resource "aws_iam_role_policy_attachment" "task_execution" {
  role       = aws_iam_role.task_execution.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy"
}

resource "aws_iam_role" "task" {
  name               = "${local.name}-task-role"
  assume_role_policy = data.aws_iam_policy_document.task_execution_assume_role.json
  tags               = local.common_tags
}

resource "aws_ecs_task_definition" "api" {
  family                   = "${local.name}-task"
  network_mode             = "awsvpc"
  requires_compatibilities = ["FARGATE"]
  cpu                      = var.container_cpu
  memory                   = var.container_memory
  execution_role_arn       = aws_iam_role.task_execution.arn
  task_role_arn            = aws_iam_role.task.arn

  container_definitions = jsonencode([
    {
      name  = "api"
      image = "${aws_ecr_repository.api.repository_url}:${var.container_image_tag}"
      essential = true
      portMappings = [
        {
          containerPort = var.container_port
          hostPort      = var.container_port
          protocol      = "tcp"
        }
      ]
      logConfiguration = {
        logDriver = "awslogs"
        options = {
          awslogs-group         = aws_cloudwatch_log_group.api.name
          awslogs-region        = var.aws_region
          awslogs-stream-prefix = "api"
        }
      }
      environment = [
        {
          name  = "NODE_ENV"
          value = var.environment
        },
        {
          name  = "PORT"
          value = tostring(var.container_port)
        }
      ]
    }
  ])

  tags = local.common_tags
}

resource "aws_ecs_service" "api" {
  name            = "${local.name}-service"
  cluster         = aws_ecs_cluster.main.id
  task_definition = aws_ecs_task_definition.api.arn
  desired_count   = var.desired_count
  launch_type     = "FARGATE"

  deployment_circuit_breaker {
    enable   = true
    rollback = true
  }

  network_configuration {
    subnets          = aws_subnet.public[*].id
    security_groups  = [aws_security_group.service.id]
    assign_public_ip = true
  }

  load_balancer {
    target_group_arn = aws_lb_target_group.api.arn
    container_name   = "api"
    container_port   = var.container_port
  }

  lifecycle {
    ignore_changes = [desired_count]
  }

  tags = local.common_tags

  depends_on = [aws_lb_listener.http]
}

resource "aws_cloudwatch_metric_alarm" "ecs_cpu_high" {
  alarm_name          = "${local.name}-ecs-cpu-high"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 3
  metric_name         = "CPUUtilization"
  namespace           = "AWS/ECS"
  period              = 60
  statistic           = "Average"
  threshold           = 80
  alarm_description   = "Average ECS service CPU above 80%"

  dimensions = {
    ClusterName = aws_ecs_cluster.main.name
    ServiceName = aws_ecs_service.api.name
  }

  tags = local.common_tags
}

resource "aws_cloudwatch_metric_alarm" "ecs_memory_high" {
  alarm_name          = "${local.name}-ecs-memory-high"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 3
  metric_name         = "MemoryUtilization"
  namespace           = "AWS/ECS"
  period              = 60
  statistic           = "Average"
  threshold           = 80
  alarm_description   = "Average ECS service memory above 80%"

  dimensions = {
    ClusterName = aws_ecs_cluster.main.name
    ServiceName = aws_ecs_service.api.name
  }

  tags = local.common_tags
}

resource "aws_cloudwatch_metric_alarm" "alb_5xx" {
  alarm_name          = "${local.name}-alb-5xx"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 1
  metric_name         = "HTTPCode_Target_5XX_Count"
  namespace           = "AWS/ApplicationELB"
  period              = 60
  statistic           = "Sum"
  threshold           = 5
  alarm_description   = "ALB 5xx responses exceed threshold"

  dimensions = {
    LoadBalancer = aws_lb.api.arn_suffix
  }

  tags = local.common_tags
}

resource "aws_cloudwatch_dashboard" "main" {
  dashboard_name = "${local.name}-observability"

  dashboard_body = jsonencode({
    widgets = [
      {
        type = "metric"
        width = 12
        height = 6
        properties = {
          title  = "ECS Service CPU/Memory"
          view   = "timeSeries"
          region = var.aws_region
          stacked = false
          metrics = [
            ["AWS/ECS", "CPUUtilization", "ClusterName", aws_ecs_cluster.main.name, "ServiceName", aws_ecs_service.api.name],
            ["AWS/ECS", "MemoryUtilization", "ClusterName", aws_ecs_cluster.main.name, "ServiceName", aws_ecs_service.api.name]
          ]
        }
      },
      {
        type = "metric"
        width = 12
        height = 6
        properties = {
          title  = "ALB Request Count & 5xx"
          view   = "timeSeries"
          region = var.aws_region
          metrics = [
            ["AWS/ApplicationELB", "RequestCount", "LoadBalancer", aws_lb.api.arn_suffix],
            ["AWS/ApplicationELB", "HTTPCode_Target_5XX_Count", "LoadBalancer", aws_lb.api.arn_suffix]
          ]
        }
      }
    ]
  })
}
