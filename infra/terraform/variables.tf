variable "project_name" {
  description = "Base name applied to infrastructure resources."
  type        = string
  default     = "taskflow"
}

variable "environment" {
  description = "Deployment stage identifier."
  type        = string
  default     = "staging"
}

variable "aws_region" {
  description = "AWS region for all resources."
  type        = string
  default     = "us-east-1"
}

variable "cidr_block" {
  description = "CIDR block for the VPC."
  type        = string
  default     = "10.0.0.0/16"
}

variable "public_subnet_cidrs" {
  description = "CIDR blocks for public subnets."
  type        = list(string)
  default     = ["10.0.1.0/24", "10.0.2.0/24"]
}

variable "private_subnet_cidrs" {
  description = "CIDR blocks for private subnets used by data services."
  type        = list(string)
  default     = ["10.0.101.0/24", "10.0.102.0/24"]
}

variable "db_username" {
  description = "Master username for the Postgres instance."
  type        = string
  default     = "taskflow"
}

variable "redis_node_type" {
  description = "Node class for the Redis replication group."
  type        = string
  default     = "cache.t3.micro"
}

variable "container_port" {
  description = "Container port exposed by the API."
  type        = number
  default     = 3000
}

variable "desired_count" {
  description = "Desired number of ECS tasks."
  type        = number
  default     = 1
}

variable "container_cpu" {
  description = "CPU units reserved for the ECS task."
  type        = number
  default     = 256
}

variable "container_memory" {
  description = "Memory in MiB reserved for the ECS task."
  type        = number
  default     = 512
}

variable "container_image_tag" {
  description = "Docker image tag deployed to ECS."
  type        = string
  default     = "bootstrap"
}

variable "health_check_path" {
  description = "HTTP path used by the load balancer health check."
  type        = string
  default     = "/health"
}

variable "tags" {
  description = "Additional resource tags."
  type        = map(string)
  default     = {}
}

variable "s3_block_public_access" {
  description = "Block all public access to the attachment bucket."
  type        = bool
  default     = true
}

variable "s3_enforce_tls" {
  description = "Require TLS for S3 access."
  type        = bool
  default     = true
}
