# Prod's network (spec 001 FR-051, FR-052; research.md R-07, R-10; contracts/tunnel.md §1): one VPC with two subnets in
# one zone. The public subnet routes to the internet gateway: the tunnel end's public interface, with its Elastic IP,
# and, from group 7, EC2's. The private subnet has no route out: the tunnel end's private interface, where CloudFront's
# VPC origin reaches the relay (group 8). Neither subnet gives an address on its own; only the Elastic IP is public.

resource "aws_vpc" "prod" {
  cidr_block           = "10.42.0.0/16"
  enable_dns_support   = true
  enable_dns_hostnames = true

  tags = {
    Name      = "h4-prod"
    component = "network"
  }
}

resource "aws_subnet" "public" {
  vpc_id                  = aws_vpc.prod.id
  cidr_block              = "10.42.0.0/24"
  availability_zone       = local.zone
  map_public_ip_on_launch = false

  tags = {
    Name      = "h4-prod-public"
    component = "network"
  }
}

resource "aws_subnet" "private" {
  vpc_id                  = aws_vpc.prod.id
  cidr_block              = "10.42.1.0/24"
  availability_zone       = local.zone
  map_public_ip_on_launch = false

  tags = {
    Name      = "h4-prod-private"
    component = "network"
  }
}

resource "aws_internet_gateway" "prod" {
  vpc_id = aws_vpc.prod.id

  tags = {
    component = "network"
  }
}

resource "aws_route_table" "public" {
  vpc_id = aws_vpc.prod.id

  route {
    cidr_block = "0.0.0.0/0"
    gateway_id = aws_internet_gateway.prod.id
  }

  tags = {
    component = "network"
  }
}

# The VPC's own route alone: nothing on the private subnet reaches outside it.
resource "aws_route_table" "private" {
  vpc_id = aws_vpc.prod.id

  tags = {
    component = "network"
  }
}

resource "aws_route_table_association" "public" {
  subnet_id      = aws_subnet.public.id
  route_table_id = aws_route_table.public.id
}

resource "aws_route_table_association" "private" {
  subnet_id      = aws_subnet.private.id
  route_table_id = aws_route_table.private.id
}

# EC2's security group (group 6 made it, since the shared state's 5432 admits it alone, tunnel-end.tf; group 7 gives it
# its rules, T084). In: the relay block's 8085 and EC2's collector's 4318 from the tunnel end's two fixed addresses
# alone, its relay and its collector (contracts/tunnel.md §4), by address rather than by group, since the tunnel end's
# private group names this one and two inline groups naming each other would be a cycle. Out: HTTPS and SMTP's 465,
# which nftables keeps to the egress proxies' user (deploy/hosts/ec2/nftables.nft), and the VPC. Nothing is applied yet, so the
# description's change replaces nothing.
resource "aws_security_group" "ec2" {
  name        = "h4-ec2"
  description = "EC2's interface: 8085 and 4318 from the tunnel end alone"
  vpc_id      = aws_vpc.prod.id

  ingress {
    description = "The relay block, for the tunnel end's relay"
    protocol    = "tcp"
    from_port   = 8085
    to_port     = 8085
    cidr_blocks = ["10.42.0.10/32", "10.42.1.10/32"]
  }

  ingress {
    description = "EC2's collector, for the tunnel end's collector"
    protocol    = "tcp"
    from_port   = 4318
    to_port     = 4318
    cidr_blocks = ["10.42.0.10/32", "10.42.1.10/32"]
  }

  egress {
    description = "HTTPS, through the egress proxies alone"
    protocol    = "tcp"
    from_port   = 443
    to_port     = 443
    cidr_blocks = ["0.0.0.0/0"]
  }

  egress {
    description = "The alerts mailbox's SMTP, implicit TLS, through the gateway's proxy alone"
    protocol    = "tcp"
    from_port   = 465
    to_port     = 465
    cidr_blocks = ["0.0.0.0/0"]
  }

  egress {
    description = "Inside the VPC"
    protocol    = "-1"
    from_port   = 0
    to_port     = 0
    cidr_blocks = [aws_vpc.prod.cidr_block]
  }

  tags = {
    component = "ec2"
  }
}
