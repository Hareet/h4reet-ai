# Contract: the public view

Spec 001, re-planned 2026-11-09. Replaces the September contract (`contracts/public-view.md` at 00309c47). The sink moves to the always-on tunnel end, and each serving host publishes. Spec FR-057 to FR-059. Research: R-19. The document's fields are in [data-model.md §5](../data-model.md#5-the-public-views-document-sitestatuslatestjson-researchmd-r-19).

## 1. The publishers (each serving host)

`snapshot-publisher`, on the laptop's prod and on EC2. Every 2 minutes while its host serves:
- **it evaluates** the public dashboard's panel queries against its own Prometheus, and the shared state as `grafana_ro`. The queries are read from the provisioned dashboard's public panels, as September did, so the view and Grafana can't drift;
- **it posts** the values, with the time they were taken and its `H4_HOST`, to `snapshot-sink`: from the laptop through the tunnel's `-L 2301`, from EC2 inside the VPC, with the sink's token.

A host that doesn't serve, by the relay's status, doesn't post.

## 2. The sink (the tunnel end)

`snapshot-sink`:
- **It checks** each post against the document's schema: numbers, states, and times only. It refuses a payload, a client identifier, an operator reason, a secret, or any field it doesn't know (FR-059).
- **It adds the cloud part,** every 2 minutes, whether or not a host serves:
  - the serving host and its `since`, from the relay;
  - EC2's state, from `ec2:DescribeInstances`;
  - the kill switch, today's and the month's model spend, the laptop's fallback remainder, and the adapters' months, from the shared state as `grafana_ro`;
  - the last 10 handover events;
  - the server's month to date against its budget, from `budgets:DescribeBudget` on `h4-server-month`, read once an hour.
- **It writes** the merged document to `site/status/latest.json`, with a role that may write that one key.
- **While no host serves,** it keeps the last host part, with its time, and sets `serving.host` to `none` (FR-057).

## 3. The page, `/status/`

A static page of the site. It reads `latest.json` (cached for 60 s) and the relay's live `/api/status`, and shows:
- spec 000's FR-028 panels;
- which host serves, the handovers and their gaps, and EC2's state;
- the server's month against its budget, next to model spend against the ceilings;
- the adapters' months;
- the release on each host;
- when each part was taken (FR-058).

It has no write action, and nothing per client.

## 4. Tests

- the sink refuses each forbidden kind of field;
- the cloud part is written while no host serves;
- a stale host part shows its time;
- the page names `none` when no host serves (SC-013).
