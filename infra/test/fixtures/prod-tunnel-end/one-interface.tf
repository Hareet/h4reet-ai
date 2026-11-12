# No private interface: CloudFront's VPC origin would have nowhere to reach the relay (contracts/tunnel.md §1).
# drop: resource aws_network_interface_attachment tunnel_end_private
# expect: tunnel end: the private interface isn't its second, device 1
