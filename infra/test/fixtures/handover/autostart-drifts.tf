# The autostart switch without ignore_changes: each plan after the Author sets it "on" would show it as drift, and an
# apply would turn it back off (contracts/handover.md §5; FR-072).
# root: account
# expect: autostart: a plan would show the Author's value as drift
resource "aws_ssm_parameter" "ec2_autostart" {
  name        = "/h4reet/prod/ec2-autostart"
  description = "on lets EC2 start automatically; off stops that (spec 001 contracts/handover.md §5)"
  type        = "String"
  value       = "off"

  tags = {
    component = "handover"
  }
}
