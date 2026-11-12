# Contract: the edge, the zone, and the certificate

Spec 001, re-planned 2026-11-09. Replaces the September contract (`contracts/edge.md` at 00309c47). The domain is hareet.ai (spec Assumptions). The origin for `/api/*` is the relay on the tunnel end, by the Author's answer to the plan's question 1; [§6](#6-while-aws-has-the-tunnel-end-back-spec-fr-076) covers the tunnel end on spot (question 2). Research: R-07, R-08, R-09.

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

The body is spec 000's degraded body (its contracts/gateway-http.md), built from the same schema at release and checked by a test: the cause `no_host_serving`, and `stack` null, as in `edge`'s own `api_unavailable` body. Whether a CloudFront Function can add `X-H4-Degraded-Cause` to an error response is measured in group 8; if not, the cause is in the body only, for this case. **As built in group 8:** not measured, since nothing in the session reaches AWS; the cause is in the body only for this case, to confirm in W2 (plan.md §16, "Group 8, as built", 14). The body's `request_id` is null too: a file has no request to name. A viewer-request CloudFront Function, `h4-site-index`, serves a folder's `index.html` on the default behavior (12).

## 5. Releases of the site

As September §4: `make release` syncs the build to `site/`, keeps a copy under `releases/<commit>/`, and invalidates once. The distribution's configuration never changes for a release, so Terraform's state stays true. A rollback syncs the previous release's copy back.

## 6. While AWS has the tunnel end back (spec FR-076)

The VPC origin can't be reached, so §4's error responses answer every `/api/*` request with `no_host_serving`, and the default behavior keeps serving the site from its bucket. Nothing in the distribution changes. When the tunnel end returns, the next request reaches the relay again; the error-caching TTL is 0.
