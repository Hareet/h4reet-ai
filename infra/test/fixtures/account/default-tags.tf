# The account root's resources tagged as prod's (FR-002).
# expect: provider: default_tags aren't project h4reet-ai and environment account
provider "aws" {
  region = "us-east-1"

  default_tags {
    tags = {
      project     = "h4reet-ai"
      environment = "prod"
    }
  }
}
