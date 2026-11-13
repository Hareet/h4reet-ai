# A root volume without the project tag, which the server budget's filter wouldn't count (T154).
# expect: ec2: its root volume isn't encrypted gp3 tagged
resource "aws_instance" "ec2" {
  ami                         = data.aws_ami.al2023.id
  instance_type               = local.ec2_type
  iam_instance_profile        = aws_iam_instance_profile.ec2.name
  user_data_base64            = base64gzip(local.ec2_user_data)
  subnet_id                   = aws_subnet.public.id
  private_ip                  = "10.42.0.20"
  associate_public_ip_address = true
  vpc_security_group_ids      = [aws_security_group.ec2.id]

  instance_market_options {
    market_type = "spot"

    spot_options {
      spot_instance_type             = "persistent"
      instance_interruption_behavior = "stop"
    }
  }

  # IMDSv2 alone, one hop, so no container reaches the instance's credentials (rule T13; research.md R-15). Its tags are
  # in its metadata: write_env.py and preflight confirm the Name tag, h4-prod-ec2, before the stack starts (R-28).
  metadata_options {
    http_endpoint               = "enabled"
    http_tokens                 = "required"
    http_put_response_hop_limit = 1
    instance_metadata_tags      = "enabled"
  }

  # A busy burstable instance slows down rather than billing past its baseline (research.md R-04).
  credit_specification {
    cpu_credits = "standard"
  }

  # The images and the OS; the stack's stores are on the data volume (ec2.tf). Tagged with project too, which the
  # server budget's filter reads and the provider's default tags may not reach on a root volume (T154).
  root_block_device {
    volume_type           = "gp3"
    volume_size           = 20
    encrypted             = true
    delete_on_termination = true

    tags = {
      component = "ec2"
    }
  }

  tags = {
    Name      = "h4-prod-ec2"
    component = "ec2"
  }

  lifecycle {
    # A newer image or a changed host file reaches EC2 only through a reviewed replace: terraform_data.ec2_generation
    # holds the user data's SHA-256 and local.ec2_generation (ec2.tf), and W2 sets the generation to 2 for SC-005
    # (tasks.md T097). The server action, EC2's model action's role, and /h4reet/prod/ec2-instance-id name this
    # instance from this root, so the same plan updates them.
    ignore_changes       = [ami, user_data_base64]
    replace_triggered_by = [terraform_data.ec2_generation]
  }
}
