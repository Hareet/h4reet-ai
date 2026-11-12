# The hours in a zone question 1a never offered: the functions carry two zones' rules alone, and would refuse every
# start (ADR 0048, decision 1).
# root: account
# expect: hours: its zone isn't one of question 1a's two
locals {
  ec2_hours = {
    zone  = "Europe/Paris"
    open  = "07:00"
    close = "19:00"
  }
  ec2_hours_value      = "${local.ec2_hours.zone} ${local.ec2_hours.open}-${local.ec2_hours.close}"
  ec2_hours_open_cron  = "cron(${tonumber(split(":", local.ec2_hours.open)[1])} ${tonumber(split(":", local.ec2_hours.open)[0])} * * ? *)"
  ec2_hours_close_cron = "cron(${tonumber(split(":", local.ec2_hours.close)[1])} ${tonumber(split(":", local.ec2_hours.close)[0])} * * ? *)"
}
