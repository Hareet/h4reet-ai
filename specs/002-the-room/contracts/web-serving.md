# Contract: serving the room on the local tier

Spec: FR-057, FR-059. Plan: §1. Research: R-09. Changes spec 000's [env-files.md](../../000-local-foundations/contracts/env-files.md) (a sixth port key) and its plan §1 (a sixth listener).

## 1. The `web` image

| Property | Value |
|---|---|
| Built from | `apps/web/Dockerfile`: a build stage on spec 000's pinned Node base runs `npm ci --ignore-scripts` and the workspace's build; the runtime stage is spec 000's pinned `nginx-unprivileged` with `dist/` copied in |
| Built by | `deploy/scripts/web_image.py`, once per commit, outside compose, as `gateway_image.py` (spec 000 plan §4, T184): `h4reet-web:${H4_REF:-working-tree}`, `pull_policy: never` |
| Drafts | the build argument `ROOM_DRAFTS`: `1` for dev and dev-cpu, empty for prod ([resume-source.md §5](resume-source.md#5-approvals)) |
| Listens | 8080, inside the stack's `internal` network only |
| Root filesystem | read-only, with a tmpfs `/tmp` |
| Health check | `wget -qO- http://127.0.0.1:8080/healthz` (a static file) |
| Limits | 0.1 CPU, 32 MiB |
| Logs | method, path, status, and duration only |

## 2. The stack's `edge`

A new listener, internal port 8087, published at `127.0.0.1:${H4_SITE_PORT}`, the stack's x005:

| Stack | x005 |
|---|---|
| prod | 18005 |
| dev | 18105 |
| dev-cpu | 18305 |

| Location | To | Rules |
|---|---|---|
| `/` | `web:8080` | GET and HEAD only |
| `= /api/room/events` | `gateway:8080/room/events` | POST only; [room-events.md §2](room-events.md#2-the-edge)'s limits |
| `/api/` | – | 404 until the conversation endpoint exists ([room-conversation.md](room-conversation.md)) |
| (`web` unreachable) | – | 503 with a static page: "The room is unavailable right now." |

Port 8087 is clear of spec 001's draft, which gives 8085 and 8086 to the tunnel's blocks.

## 3. Headers

Set by the `web` image on every response:

```text
Content-Security-Policy: default-src 'self'; img-src 'self' data:; style-src 'self'; script-src 'self'; connect-src 'self'; font-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'
Referrer-Policy: no-referrer
Permissions-Policy: microphone=(self), camera=(), geolocation=()
X-Content-Type-Options: nosniff
Cache-Control: public, max-age=31536000, immutable      (hashed assets)
Cache-Control: no-cache                                  (index.html, room-data.json, room-manifest.json, resume.pdf)
```

No `Set-Cookie`, ever.

## 4. Environment and preflight

- **The key:** `H4_SITE_PORT` joins the env templates (`prod.env.example`, `dev.env.example`) and `dev-cpu.vars`, fixed per stack as above. `make init-env SYNC=1` appends it to an existing env file.
- **Preflight** checks it as the other five port keys: the stack's value, and free on 127.0.0.1.
- **The compose policy** allows this one more loopback publication on `edge`.

## 5. Spec 001

When spec 001's edge exists, its site bucket gets the same `apps/web/dist/`, and its CloudFront response headers policy carries §3's headers. Its relay forwards `/api/room/events` with its public cap. That's a change to spec 001's draft plan (its §8.1 placeholder site becomes this build), recorded in this spec's note.
