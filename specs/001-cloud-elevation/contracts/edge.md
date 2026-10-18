# Contract: the edge, the DNS zone, and the certificate

Spec 001 (FR-027 to FR-029, FR-032, FR-034, FR-038, FR-041, FR-042) · Plan: [§4.1](../plan.md#41-cloudfront-and-dns-fr-027-to-fr-029-fr-034-r-07-to-r-09), [§8.1](../plan.md#81-the-site-fr-036-to-fr-038-fr-041-fr-042) · Research: [R-07](../research.md#r-07-cloudfront-reaches-the-relay-through-a-vpc-origin-on-a-second-network-interface-to-ask-question-2), [R-08](../research.md#r-08-the-edges-own-degraded-answer-fr-034), [R-09](../research.md#r-09-the-domain-in-route-53-to-ask-question-4)

The edge is one CloudFront distribution in `infra/prod/edge.tf`. Its cache and origin-request policies, and anything that limits requests, are in protected files (`infra/prod/edge-limits.tf`, research R-14). This contract fixes what the distribution does, what it sends to each origin, and what a visitor's browser gets back.

## 1. The distribution

| Setting | Value |
|---|---|
| Aliases | `h4reet.ai`, `www.h4reet.ai` |
| Certificate | ACM, us-east-1, for both names, validated by DNS in the Route 53 zone (§6) |
| Viewer protocol | HTTP redirects to HTTPS (301), on every behavior |
| Minimum TLS | `TLSv1.2_2021` |
| HTTP versions | HTTP/2 and HTTP/3 |
| Price class | `PriceClass_100` (North America and Europe): the cheapest, and inside the free tier either way |
| IPv6 | on |
| Default root object | `index.html` |
| Standard logs, real-time logs | off: both would store visitors' addresses (FR-042) |
| Geo restriction | none |
| WAF | none (research R-06) |

## 2. Origins

| ID | What | Protocol | Access |
|---|---|---|---|
| `site` | the site's S3 bucket (`h4reet-ai-site-<suffix>`), prefix `site/` | HTTPS | origin access control (SigV4). The bucket's policy admits only this distribution's ARN, and Block Public Access is on (FR-028) |
| `relay` | a VPC origin: the VM's `eth0`, `10.42.1.10`, port 8080 | HTTP, inside AWS's network (research R-07) | the security group admits only `com.amazonaws.global.cloudfront.origin-facing` on 8080 (FR-032), and the relay refuses peers on the VM itself ([relay-http.md §1](relay-http.md#1-listener-reachability-and-common-rules)). Group 6 measures that the prefix list admits the VPC origin's traffic (quickstart §6.5) |

- **The relay origin's timeouts:** connect 5 s, one connection attempt, read (response) 30 s, keep-alive 5 s. The read timeout is longer than the relay's 28 s deadline ([relay-http.md §3](relay-http.md#3-post-apihello-processing-order)).
- **No custom origin headers:** nothing secret is configured on the distribution or held in Terraform's state (FR-009).

## 3. Behaviors

| Path pattern | Origin | Methods | Cache policy | Origin request policy | Response headers policy | Notes |
|---|---|---|---|---|---|---|
| `/api/*` | `relay` | GET, HEAD, OPTIONS, PUT, POST, PATCH, DELETE (CloudFront's allowed set; the relay answers 405 to all but GET and POST) | `Managed-CachingDisabled` | `h4-api`: forwards `CloudFront-Viewer-Address`, `Content-Type`, and `X-H4-Probe`; no cookies, no query strings | `h4-api` | FR-029: never cached |
| `/status/latest.json` | `site` | GET, HEAD | `h4-public-view`: TTL 60 s, maximum 60 s | none | `h4-site` | the public view's data (FR-058), §4 |
| `/_degraded/*` | `site` | GET, HEAD | `Managed-CachingOptimized` | none | `h4-api` | only the edge's error responses use it |
| `*` (default) | `site` | GET, HEAD | `Managed-CachingOptimized` | none | `h4-site` | the static site |

**Response headers policies:**

| Policy | Headers |
|---|---|
| `h4-site` | `Content-Security-Policy: default-src 'self'; connect-src 'self'; img-src 'self'; style-src 'self'; script-src 'self'; font-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'`; `Strict-Transport-Security: max-age=31536000`; `X-Content-Type-Options: nosniff`; `X-Frame-Options: DENY`; `Referrer-Policy: no-referrer`; `Permissions-Policy: camera=(), microphone=(), geolocation=(), interest-cohort=()` |
| `h4-api` | `Cache-Control: no-store`; `X-Content-Type-Options: nosniff`; `Referrer-Policy: no-referrer` |

- **Cookies:** none, in either direction. The site sets none and CloudFront forwards none (FR-042).
- **The CSP** makes the browser itself refuse any request to another host, which is SC-010's mechanism. `apps/web/test_site.py` checks the built site for absolute URLs to other hosts, which is its static half.

## 4. Releases of the site, and the public view's path

The `site` origin's path is `/site`, so the URL `/x` is the object `site/x`.

- **The live site:** `make release` syncs `apps/web/dist/` to `s3://<site bucket>/site/`, deleting files the release doesn't have, except `status/latest.json`. It keeps a copy under `releases/<commit>/` for rollback, then creates one invalidation for `/*`. The first 1,000 invalidation paths a month are free, and one wildcard counts as one path. The distribution's configuration never changes for a release, so Terraform's state stays the truth about it ([releases-deployer.md §2](releases-deployer.md#2-make-release)).
- **A rollback of the site** syncs `releases/<previous commit>/` back to `site/`, with the same exclusion, and invalidates again.
- **`/status/latest.json`** is the object `site/status/latest.json`. `snapshot-sink` writes it, and its role may write that one key and nothing else ([public-view.md §2](public-view.md#2-the-sink)).

## 5. The edge's own degraded body

FR-034. **Custom error responses,** distribution-wide:

| Origin status | Response | Page | Error caching TTL |
|---|---|---|---|
| 502, 504 | 503 | `/_degraded/api.json` | 0 |
| 403, 404 (from the site's bucket) | 404 | `/404.html` | 60 |

- **503 is not in the list, on purpose.** A custom error response replaces the origin's body, and the relay's own 503s are degraded bodies whose causes the visitor and the site need, so they pass through unchanged. A relay that is down gives CloudFront a 502 (connection refused) or a 504 (a timeout), and only those become the edge's degraded body.
- **The relay never answers 502 or 504 itself.** A gateway's 502, such as spec 000's `local_error`, becomes a degraded 503 at the relay, with its cause kept ([relay-http.md §6.2](relay-http.md#62-choosing-and-falling-back-once)). So a 502 or 504 here can only mean the relay wasn't reached, and replacing it hides nothing.
- **`/_degraded/api.json`** is spec 000's degraded body with cause `edge_origin_unreachable` ([relay-http.md §7](relay-http.md#7-causes-the-relay-adds)):

  ```json
  {"state":"degraded","cause":"edge_origin_unreachable","detail":"The site's API is not answering. The edge answered instead.","ceilings":null,"stack":null,"since":null,"request_id":null,"trace_id":null}
  ```

- **The header.** A custom error response can't add `X-H4-Degraded-Cause`. Group 6 measures whether a viewer-response CloudFront Function runs on a CloudFront-generated error response. If it does, a function on `/api/*` adds the header when the body's cause is `edge_origin_unreachable`. If it doesn't, the cause travels in the body only, for this one case (research R-08). The site reads the body's `cause` either way.

## 6. DNS and the certificate

`infra/prod/dns.tf`. The zone `h4reet.ai` is public in Route 53, and holds:

| Name | Type | Value |
|---|---|---|
| `h4reet.ai` | A, AAAA | alias to the distribution |
| `www.h4reet.ai` | A, AAAA | alias to the distribution |
| the certificate's validation names | CNAME | ACM's values, as ACM gives them |
| `h4reet.ai` | CAA | `0 issue "amazon.com"` |

- **No MX record:** no mail is received on h4reet.ai (spec Assumptions).
- **Delegation:** the zone's four name servers go to the registrar by the Author's hand, outside Terraform, recorded like an apply (quickstart §6.1). The uptime probe catches a lapse (FR-061).
- **Renewal:** ACM renews the certificate on its own while the validation records stay. ACM's "approaching expiration" event, through EventBridge, alerts on both channels ([aws-alerts.md §2](aws-alerts.md#2-the-alerts-and-their-messages)).

## 7. What the edge exposes, and what it never does

- **Never cached:** dynamic answers (`/api/*`).
- **Never stored:** visitor addresses, messages, or answers. There are no logs, and CloudFront's metrics carry counts only.
- **Never loaded from another host:** anything. The site has no third-party request, which the CSP enforces.
- **The edge's metrics** (requests, 4xx and 5xx rates, bytes) are read every 5 minutes by `h4-aws-poller` ([env-cloud.md §7](env-cloud.md#7-the-vms-host-credentials-the-operator-session-the-egress-proxy)).
