# Taskflow v2

> **Note:** Currently (work in progress) deployed on AWS Fargate:  
> http://taskflow-staging-alb-1359889755.us-east-1.elb.amazonaws.com/

Collaborative project-management platform combining kanban boards with workspace administration tools.  
Teams organize work into drag-and-drop columns, open modals for detailed editing, and manage profiles, workspaces, and notifications from a unified settings panel.

---

## Overview

Taskflow v2 is a multi-package monorepo built around a **Fastify + TypeScript** backend, container-first workflows, and **AWS Fargate** deployment.  
It ships a production-ready API skeleton with health checks, automated tests, OCI images, and infrastructure as code.

---

## Repository Layout

| Path | Description |
|------|--------------|
| `apps/api` | Fastify service with Vitest coverage and TypeScript build pipeline |
| `packages/config` | Shared environment loader |
| `packages/types` | Shared Zod schemas and DTOs for API contracts |
| `packages/db` | Prisma schema and client wrapper |
| `infra/terraform` | Terraform stack for VPC, ECS Fargate, ECR, and related AWS resources |
| `.github/workflows` | CI for lint/test/build and CD pipeline for container promotion |

---

## Prerequisites

- Node.js **20.11+**  
- npm **10+**  
- Docker Desktop/Engine **or** Podman  
  - (auto-detected; set `CONTAINER_RUNTIME=podman` to override)  
- Terraform **1.6+** (for infrastructure work)

---

## Local Development

Run everything with one command:

```bash
cp .env.example .env.local     # customize if needed
npm install                    # once
npm run dev:local              # add --seed to load demo data
```

This script:
1. Starts containers (`docker compose up -d`)
2. Applies Prisma migrations
3. Launches API at <http://localhost:3000>  
   and web client at <http://localhost:5173>

Stop with `Ctrl+C`. Containers persist until you run `docker compose down`.

Quality gates:

```bash
npm run lint
npm test
npm run build
```

---

## Infrastructure Setup

1. Copy and edit Terraform variables:
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
   Outputs include ALB DNS, ECR repo, database/cache endpoints, and secret ARNs.

---

## Continuous Delivery

The GitHub Actions workflow `deploy.yml` targets **AWS Fargate** using OIDC authentication.

**Required secrets:**
- `AWS_ROLE_ARN` — IAM role for ECR, ECS, and Terraform access  
- `DATABASE_SECRET_ARN` — ARN for the Postgres Secrets Manager entry  

**Optional repository variables:**  
`AWS_REGION`, `ECR_REPOSITORY`, `ECS_CLUSTER`, `ECS_SERVICE`, `TASK_DEFINITION_FAMILY` — override defaults if Terraform naming differs.

**Pipeline stages**
1. Lint, test, and compile the API  
2. Build & push Docker image to ECR (tag = commit SHA)  
3. Register a new ECS task definition revision  
4. Force ECS service deployment  

Once complete, the Application Load Balancer DNS exposes the live health endpoint.

---

## Next Steps

- Extend Prisma schema and shared packages under `packages/`  
- Introduce Redis and background worker services  
- Expand CI with integration and smoke tests executed against ephemeral infrastructure

---

## Stack

Fastify · React (Vite) · TypeScript · Prisma · Docker · Terraform · AWS ECS/Fargate

---

## License

MIT License · built by [Daniel Kozak](https://github.com/Argotoss)
