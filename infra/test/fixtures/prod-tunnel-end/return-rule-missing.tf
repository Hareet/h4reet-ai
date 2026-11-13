# No alert at the tunnel end's return (FR-076: "its return SHALL be alerted"; group 5's review, "Missing").
# drop: resource aws_cloudwatch_event_rule tunnel_end_running
# drop: resource aws_cloudwatch_event_target tunnel_end_running
# expect: return: h4-tunnel-end-running is missing
