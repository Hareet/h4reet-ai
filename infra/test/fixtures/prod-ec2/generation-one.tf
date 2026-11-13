# W1's generation in W2's tree: W2's plan would keep the EC2 W1 made, so SC-005's replace never runs (tasks.md T097).
# expect: generation: ec2.tf's local.ec2_generation isn't W2's 2
# into: ec2.tf
# drop: locals ec2_type
locals {
  ec2_type = "t4g.large"

  ec2_generation = 1

  ec2_data_volume_gib = 20
}
