# Prod reading a repository the account's W1 apply makes, rather than naming it.
# expect: reads: aws_ecr_repository.tunnel reads what another root may make
data "aws_ecr_repository" "tunnel" {
  name = "h4reet/tunnel"
}
