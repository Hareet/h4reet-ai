# h4-rehearsal-instance answers IMDSv1 (rule T13).
# expect: rehearsal instance: it isn't a t4g.nano with no public address and IMDSv2 at hop limit 1
resource "aws_instance" "rehearsal" {
  count                       = local.rehearsal ? 1 : 0
  ami                         = data.aws_ami.rehearsal[0].id
  instance_type               = "t4g.nano"
  subnet_id                   = aws_subnet.rehearsal[0].id
  vpc_security_group_ids      = [aws_security_group.rehearsal[0].id]
  associate_public_ip_address = false

  metadata_options {
    http_endpoint               = "enabled"
    http_tokens                 = "optional"
    http_put_response_hop_limit = 1
  }

  tags = {
    Name      = "h4-rehearsal-instance"
    component = "rehearsal"
  }
}
