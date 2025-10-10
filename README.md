# Taskflow v2

## Overview
Taskflow v2 is a multi-package workspace targeting a Fastify + TypeScript backend, container-first workflows, and AWS Fargate deployment. The repository currently ships a production-ready API skeleton with health checks, automated testing, OCI images, and infrastructure as code.

## Repository Layout
- `apps/api`: Fastify service with Vitest coverage and TypeScript build pipeline.
- `infra/terraform`: Terraform stack for VPC, ECS Fargate, ECR, and supporting AWS resources.
- `.github/workflows`: CI for lint/test/build and CD pipeline for container promotion to AWS.

## Prerequisites
- Node.js 20.11+
- npm 10+
- Podman 4+ (for local image builds)
- Terraform 1.6+

## Local Development
Install dependencies once:
```bash
npm ci
```

Run quality gates:
```bash
npm run lint
npm run test
npm run build
```

Start the API locally:
```bash
npm run dev:api
```

## Container Workflow
Build and run the container with Podman Compose:
```bash
podman compose up --build
```
The API exposes `http://localhost:3000/health`.

## Infrastructure Setup
1. Copy and adjust variables:
   ```bash
   cp infra/terraform/terraform.tfvars.example infra/terraform/terraform.tfvars
   ```
2. Configure remote state (recommended):
   ```bash
   cp infra/terraform/backend.hcl.example infra/terraform/backend.hcl
   ```
   Create the referenced S3 bucket and DynamoDB table, then initialize:
   ```bash
   terraform -chdir=infra/terraform init -backend-config=backend.hcl
   ```
3. Provision AWS resources:
   ```bash
   terraform -chdir=infra/terraform apply
   ```
   Outputs include the load balancer DNS name and ECR repository URL.

## Continuous Delivery
The `deploy` workflow targets AWS Fargate using GitHub OIDC authentication. Required GitHub secrets/variables:
- `AWS_ROLE_ARN`: IAM role allowing ECR push, ECS updates, and Terraform state access if used.
- Optionally override defaults via repository variables (`AWS_REGION`, `ECR_REPOSITORY`, `ECS_CLUSTER`, `ECS_SERVICE`, `TASK_DEFINITION_FAMILY`) if the Terraform naming differs.

Pipeline stages:
1. Lint, test, and compile the API.
2. Build and push the Docker image to Amazon ECR tagged with the current commit SHA.
3. Register a new ECS task definition revision referencing the pushed image.
4. Force a new deployment on the ECS service.

Ensure Terraform has created the baseline ECS task definition before running the workflow. After the first successful deployment, the Application Load Balancer DNS exposes the live health endpoint.

## Next Steps
- Extend Prisma schema and shared packages under `packages/`.
- Introduce Redis and background worker services.
- Expand CI with integration and smoke tests executed against ephemeral infrastructure.
