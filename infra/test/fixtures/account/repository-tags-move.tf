# A function's tag could be pushed over (plan.md Technical Context: images by digest, promoted unchanged).
# expect: registry: a repository's tags can move, or it isn't scanned on push
resource "aws_ecr_repository" "lambda" {
  for_each             = toset(local.lambda_repositories)
  name                 = each.key
  image_tag_mutability = "MUTABLE"

  image_scanning_configuration {
    scan_on_push = true
  }

  tags = {
    component = "registry"
  }
}
