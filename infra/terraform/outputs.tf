output "load_balancer_dns_name" {
  description = "Public DNS name for the API load balancer."
  value       = aws_lb.api.dns_name
}

output "ecr_repository_url" {
  description = "Container registry URL for API images."
  value       = aws_ecr_repository.api.repository_url
}

output "ecs_cluster_name" {
  description = "ECS cluster name."
  value       = aws_ecs_cluster.main.name
}

output "ecs_service_name" {
  description = "ECS service name."
  value       = aws_ecs_service.api.name
}

output "database_endpoint" {
  description = "Postgres endpoint address."
  value       = aws_db_instance.postgres.address
}

output "database_secret_arn" {
  description = "Secrets Manager ARN containing Postgres credentials."
  value       = aws_secretsmanager_secret.database.arn
}

output "cache_endpoint" {
  description = "Redis primary endpoint."
  value       = aws_elasticache_replication_group.redis.primary_endpoint_address
}

output "cache_secret_arn" {
  description = "Secrets Manager ARN containing Redis auth token."
  value       = aws_secretsmanager_secret.cache.arn
}
