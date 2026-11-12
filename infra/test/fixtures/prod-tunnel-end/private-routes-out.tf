# The private subnet's table with a route to the internet gateway: CloudFront's private side would reach out.
# expect: network: no single route to the one internet gateway
resource "aws_route_table" "private" {
  vpc_id = aws_vpc.prod.id

  route {
    cidr_block = "0.0.0.0/0"
    gateway_id = aws_internet_gateway.prod.id
  }

  tags = {
    component = "network"
  }
}
