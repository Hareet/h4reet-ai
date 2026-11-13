# The account's half of the handover (spec 001 FR-063 to FR-066, FR-069 to FR-072; contracts/handover.md §2 to §5;
# plan.md §16, "Why a switch"; ADR 0049, proposed). Protected (FR-012; rule T5): it changes only by the Author's patch.
# Group 5 writes the switch alone; group 9 adds h4-ec2-start, h4-ec2-guard, their permissions, the autostart switch,
# the hours' schedules, and h4-laptop-away-rule behind it.

locals {
  # The switch (plan.md §16): false in W1, whose three plan blocks are made before any of W1's applies, so nothing here
  # may need another root's W1 apply, or an image not pushed yet. The Author's P-W2 sets it true for W2. Each resource
  # behind it is written `count = local.wired ? 1 : 0`.
  wired = false
}
