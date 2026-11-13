# An RDS instance beside the tunnel end's store: W1 replaced RDS (spec.md Assumptions).
# into: shared-state.tf
# expect: rds: aws_db_instance.shared_state is RDS
resource "aws_db_instance" "shared_state" {
  engine            = "postgres"
  instance_class    = "db.t4g.micro"
  allocated_storage = 20

  tags = {
    component = "shared-state"
  }
}
