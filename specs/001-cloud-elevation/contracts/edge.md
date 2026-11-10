# Contract: the edge, the zone, and the certificate

Spec 001, re-planned 2026-11-09. Replaces the September contract (`contracts/edge.md` at 00309c47). The domain is hareet.ai (spec Assumptions). The origin for `/api/*` is the relay on the tunnel end, as plan question 1 recommends ([§6](#6-if-plan-question-1-is-b)). Research: R-07, R-08, R-09.

## 1. The zone (FR-027)

- **The zone:** the public hosted zone `hareet.ai` in `infra/prod/dns.tf`.
- **Records:**
  - `hareet.ai` and `www.hareet.ai`: A and AAAA aliases to the distribution;
  - ACM's validation records;
  - none for the hosts.
- **Delegation:** the Author points the registrar's name servers at the zone, a human step outside Terraform, recorded like an apply (contracts/infra-records.md §6).

## 2. The certificate

ACM in us-east-1, for `hareet.ai` and `www.hareet.ai`, validated by DNS in the zone and renewed by ACM. Its expiry events reach `h4-alerts` (contracts/aws-alerts.md §2).

## 3. The distribution (FR-027 to FR-029)

| Setting | Value |
|---|---|
| Aliases | `hareet.ai`, `www.hareet.ai` |
| Viewer protocol | redirect HTTP to HTTPS; TLS policy at the provider's current recommended minimum (to confirm) |
| Access logs | off: they would store visitors' addresses (FR-042) |
| Origin `site` | the site's bucket, through origin access control |
| Origin `relay` | a VPC origin: the tunnel end's private interface, port 8080, HTTP inside AWS's network |

| Behavior | Origin | Cache policy | Origin request policy | Response headers |
|---|---|---|---|---|
| `/api/*` | `relay` | `CachingDisabled` | forward `CloudFront-Viewer-Address`, `Content-Type`, `Accept`, `traceparent`; no cookies, no query strings | none added |
| default | `site` | cached; `index.html` short-lived | none | the CSP, HSTS, `Referrer-Policy: no-referrer`, and a `Permissions-Policy` that turns off camera, microphone, and geolocation |

**The CSP** is spec 002's (its contracts/web-serving.md §3), with `connect-src 'self'`, so every request stays on hareet.ai (SC-010).

## 4. Its own degraded answer (FR-034, FR-066; research.md R-08)

| Origin status for `/api/*` | The edge answers | Body |
|---|---|---|
| 502, 504 (the relay unreachable) | 503 | `/_degraded/api.json` from the site's bucket, cause `no_host_serving`; error-caching TTL 0 |
| 503 from the relay | passed through | the relay's degraded body, cause intact |

The body is spec 000's degraded body (its contracts/gateway-http.md), built from the same schema at release and checked by a test: the cause `no_host_serving`, and `stack` null, as in `edge`'s own `api_unavailable` body. Whether a CloudFront Function can add `X-H4-Degraded-Cause` to an error response is measured in group 8; if not, the cause is in the body only, for this case.

## 5. Releases of the site

As September §4: `make release` syncs the build to `site/`, keeps a copy under `releases/<commit>/`, and invalidates once. The distribution's configuration never changes for a release, so Terraform's state stays true. A rollback syncs the previous release's copy back.

## 6. If plan question 1 is B

- **Origin `relay`** becomes a custom origin named `api-origin.hareet.ai`, HTTPS only.
- **Route 53 failover records** for that name: the primary is the tunnel end's Elastic IP, with the health check (contracts/handover.md §1); the secondary is EC2's fixed address.
- **Certificates:** each host terminates TLS with a certificate for that name, from a public authority, through a DNS challenge on a record each host may write.
- **The secret origin header:** a viewer-request CloudFront Function adds it, reading it from a key-value store the Author writes.
- **Security groups:** they admit CloudFront's origin-facing prefix list on 443.
