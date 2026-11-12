# The probe on x86_64, not its arm64 image (research.md R-02).
# expect: functions: h4-probe isn't its image on arm64
resource "aws_lambda_function" "probe" {
  count         = local.lambda_images.probe == "" ? 0 : 1
  function_name = "h4-probe"
  role          = aws_iam_role.probe.arn
  package_type  = "Image"
  image_uri     = "${aws_ecr_repository.lambda["h4-probe"].repository_url}@${local.lambda_images.probe}"
  architectures = ["x86_64"]

  tags = {
    component = "probe"
  }
}
