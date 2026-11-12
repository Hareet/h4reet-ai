# The switch read from something other than a literal, which a plan's input could then decide (plan.md §16, "Why a
# switch"; group 5's review, I8). W1's off and W2's on are both literals, each a reviewed change.
# expect: switch: prod's handover.tf doesn't hold local.wired as a boolean literal
locals {
  wired = local.tunnel_end_type != "measure-in-T166"
}
