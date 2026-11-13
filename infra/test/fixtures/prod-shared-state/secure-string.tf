# A SecureString in Terraform: the shared state's TLS key is the Author's, outside Terraform (rule T9).
# into: ssm.tf
# expect: parameters: aws_ssm_parameter.shared_state_tls_key isn't a String
resource "aws_ssm_parameter" "shared_state_tls_key" {
  name  = "/h4reet/tunnel-end/SHARED_STATE_TLS_KEY"
  type  = "SecureString"
  value = "placeholder"

  tags = {
    component = "shared-state"
  }
}
