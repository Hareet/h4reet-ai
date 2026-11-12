# The switch on in W1: a switched resource would read what another of W1's applies makes (plan.md §16).
# expect: switch: prod's handover.tf doesn't hold local.wired = false
locals {
  wired = true
}
