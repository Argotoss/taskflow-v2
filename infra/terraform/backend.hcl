bucket         = "taskflow-terraform-state"
key            = "taskflow/terraform.tfstate"
region         = "eu-north-1"
dynamodb_table = "terraform-locks"
encrypt        = true
