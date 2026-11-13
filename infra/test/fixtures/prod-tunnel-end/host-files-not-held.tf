# The host's files out of the replace's trigger: a changed host file would stay in the repository and never reach
# the tunnel end, with no plan that shows it (group 5's review, I3).
# expect: host: no terraform_data.tunnel_end_host in tunnel-end.tf holds the user data's SHA-256 and the generation
resource "terraform_data" "tunnel_end_host" {
  input = {
    generation = local.tunnel_end_generation
  }
}
