# The Elastic IP on the private interface: the tunnel's port would face the wrong subnet.
# expect: tunnel end: its one Elastic IP isn't on the public interface
resource "aws_eip" "tunnel_end" {
  domain                    = "vpc"
  network_interface         = aws_network_interface.tunnel_end_private.id
  associate_with_private_ip = "10.42.0.10"

  tags = {
    Name      = "h4-tunnel-end"
    component = "tunnel-end"
  }

  depends_on = [aws_internet_gateway.prod]
}
