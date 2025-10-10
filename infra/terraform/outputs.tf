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
