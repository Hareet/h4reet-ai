# default_tags without the environment (FR-002; rule T1).
# expect: tags: default_tags lacks environment = account
provider "aws" {
  region = "us-east-1"

  default_tags {
    tags = {
      project = "h4reet-ai"
    }
  }
}
