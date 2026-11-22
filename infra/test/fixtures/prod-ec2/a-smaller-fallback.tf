# A fallback with less memory than t4g.large: the stack wouldn't fit (spec 032 FR-001).
# into: ec2.tf
# drop: locals ec2_type
# expect: type: t4g.medium has less memory than t4g.large
locals {
  # R-04's choice of 2026-11-11, from group 2's measurement: 2 vCPU and 8 GiB, Graviton, burstable (standard credits).
  # From spec 032 the first of EC2's list.
  ec2_type = local.ec2_types[0].type

  # EC2's interchangeable types, in the order h4-ec2-start tries them when a type has no spot capacity (spec 032 FR-001,
  # FR-002; ADR 0057): Graviton alone, each with the first type's memory or more, in local.zone. Each one's price
  # ceiling, in US dollars an hour, is the first type's on-demand price, so no fallback costs more an hour than
  # t4g.large would on demand (the Author confirms the list prices before his apply; spec 032 SC-006).
  ec2_types = [
    { type = "t4g.large", max_price = "0.0672" },
    { type = "m7g.large", max_price = "0.0672" },
    { type = "m6g.large", max_price = "0.0672" },
    { type = "t4g.medium", max_price = "0.0336" },
  ]
  # The protected ec2-market.tf's launch templates, one for each type, with its place on the list.
  ec2_templates = { for i, t in local.ec2_types : t.type => merge(t, { order = i }) }

  # EC2's generation: 1 in W1; W2 sets 2, so W2's prod block shows EC2 replaced, the server action and the ID's
  # parameter updated with it, and SC-005 is checked after W2's apply (tasks.md T097, T175). An OS update is a new one
  # too.
  ec2_generation = 2

  # The data volume: Docker's data root, so the images and the stack's named volumes (Langfuse's four stores, Prometheus,
  # Loki, Grafana) outlive a replace of the instance. 20 GiB, R-05's size from R-33's measurement.
  ec2_data_volume_gib = 20

  # The host's files, from deploy/hosts/ec2/ and deploy/scripts/, into cloud-init's user data at the first boot, as the
  # tunnel end's: a change to them reaches a running EC2 only through a replace, which terraform_data.ec2_generation
  # shows in the plan. The deployer itself comes from the release's tree (deploy_first_step.py; plan.md §16, "From the
  # release"), and so do the host's later parts: the gateway's proxy and its allowlist, and the gateway's credential
  # timer (deploy/hosts/ec2/ec2_host.py, from deploy/hosts/ec2/release/).
  ec2_host_files = {
    "/etc/h4reet/nftables.nft"                                     = { source = "deploy/hosts/ec2/nftables.nft", mode = "0600" }
    "/etc/h4reet/egress-allowlist.txt"                             = { source = "deploy/hosts/ec2/egress-allowlist.txt", mode = "0644" }
    "/etc/h4reet/ec2.env.example"                                  = { source = "deploy/hosts/ec2/ec2.env.example", mode = "0644" }
    "/etc/docker/daemon.json"                                      = { source = "deploy/hosts/ec2/daemon.json", mode = "0644" }
    "/etc/systemd/system/h4-nftables.service"                      = { source = "deploy/hosts/ec2/systemd/h4-nftables.service", mode = "0644" }
    "/etc/systemd/system/h4-egress-proxy.service"                  = { source = "deploy/hosts/ec2/systemd/h4-egress-proxy.service", mode = "0644" }
    "/etc/systemd/system/h4-write-env.service"                     = { source = "deploy/hosts/ec2/systemd/h4-write-env.service", mode = "0644" }
    "/etc/systemd/system/h4-stack.service"                         = { source = "deploy/hosts/ec2/systemd/h4-stack.service", mode = "0644" }
    "/etc/systemd/system/h4-deployer.service"                      = { source = "deploy/hosts/ec2/systemd/h4-deployer.service", mode = "0644" }
    "/etc/systemd/system/h4-deployer.timer"                        = { source = "deploy/hosts/ec2/systemd/h4-deployer.timer", mode = "0644" }
    "/etc/systemd/system/docker.service.d/h4-data.conf"            = { source = "deploy/hosts/ec2/systemd/docker-data.conf", mode = "0644" }
    "/etc/systemd/system/amazon-ssm-agent.service.d/h4-proxy.conf" = { source = "deploy/hosts/ec2/systemd/amazon-ssm-agent-proxy.conf", mode = "0644" }
    "/opt/h4reet/deploy/scripts/write_env.py"                      = { source = "deploy/scripts/write_env.py", mode = "0755" }
    "/opt/h4reet/deploy/scripts/egress_proxy.py"                   = { source = "deploy/scripts/egress_proxy.py", mode = "0755" }
    "/opt/h4reet/deploy/scripts/deploy_first_step.py"              = { source = "deploy/scripts/deploy_first_step.py", mode = "0755" }
  }
  ec2_user_data = templatefile("${path.module}/../../deploy/hosts/ec2/cloud-init.yaml.tftpl", {
    files = { for p, f in local.ec2_host_files : p => { mode = f.mode, content = file("${path.module}/../../${f.source}") } }
  })
}
