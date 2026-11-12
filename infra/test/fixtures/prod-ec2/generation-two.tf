# W2's generation in W1's tree: W1's plan would replace an EC2 it has just made.
# expect: generation: ec2.tf's local.ec2_generation isn't W1's 1
# into: ec2.tf
# drop: locals ec2_type
locals {
  ec2_type = "t4g.large"

  ec2_generation = 2

  ec2_data_volume_gib = 20
}
