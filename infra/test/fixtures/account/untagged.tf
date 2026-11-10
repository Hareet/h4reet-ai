# The probe's log group without its component tag (FR-002; rule T2).
# expect: tags: aws_cloudwatch_log_group.probe sets no component
resource "aws_cloudwatch_log_group" "probe" {
  name              = "/aws/lambda/h4-probe"
  retention_in_days = 30
}
