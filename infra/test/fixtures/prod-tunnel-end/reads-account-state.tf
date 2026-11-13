# Prod reading the account's state: its W1 block would read what the account's W1 apply hasn't made (plan.md §16).
# expect: reads: terraform_remote_state.account reads another root's state
data "terraform_remote_state" "account" {
  backend = "s3"

  config = {
    key    = "account.tfstate"
    region = "us-east-1"
  }
}
