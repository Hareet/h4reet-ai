# h4-rehearsal-target may be assumed by any principal the account lets, so it isn't a target no one uses.
# expect: rehearsal target: someone could assume it
data "aws_iam_policy_document" "rehearsal_target_trust" {
  count = local.rehearsal ? 1 : 0

  statement {
    sid     = "NoOne"
    effect  = "Allow"
    actions = ["sts:AssumeRole"]

    principals {
      type        = "AWS"
      identifiers = ["arn:aws:iam::${data.aws_caller_identity.current.account_id}:root"]
    }
  }
}
