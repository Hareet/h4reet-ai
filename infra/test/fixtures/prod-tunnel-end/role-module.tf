# A local module, which could give the role a policy where the check can't see it (the second review, I-A).
# into: main.tf
# expect: role: module extra could give the role a policy
module "extra" {
  source = "./modules/extra"
  role   = aws_iam_role.tunnel_end.name
}
