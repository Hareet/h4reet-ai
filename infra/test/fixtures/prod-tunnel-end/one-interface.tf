# No public interface: the tunnel's 2222 and the health port would have nowhere to arrive, and the host no way out
# (contracts/tunnel.md §1; B-6, option C, makes the private interface the primary and the public one the second).
# drop: resource aws_network_interface_attachment tunnel_end_public
# expect: tunnel end: the public interface isn't its second, device 1
