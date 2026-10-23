# Contract: serving the room on the local tier

Spec: FR-057, FR-059. Plan: §1. Research: R-09. Changes spec 000's [env-files.md](../../000-local-foundations/contracts/env-files.md) (a sixth port key) and its plan §1 (a sixth listener).

## 1. The `web` image

| Property | Value |
|---|---|
| Built from | `apps/web/Dockerfile`: a build stage on spec 000's pinned Node base runs `npm ci --ignore-scripts` and the workspace's build; the runtime stage is spec 000's pinned `nginx-unprivileged` with `dist/` copied in |
| Built by | `deploy/scripts/web_image.py`, outside compose, on every `make up` (the layer cache keeps an unchanged build to seconds): `h4reet-web:${H4_REF:-working-tree}${H4_WEB_SUFFIX}`, `pull_policy: never`. **Unlike `gateway_image.py`** (spec 000 plan §4, T184), it never reuses a tag across stacks, or from an earlier run: the image bakes in the drafts flag and `main`'s approvals as they stood at build time, so prod and dev at one commit run different images, and an approval on `main` reaches the next `make up` |
| Drafts | `H4_WEB_SUFFIX`, fixed per stack class (§4): empty for prod, `-drafts` for dev and dev-cpu. `web_image.py` passes the build argument `ROOM_DRAFTS=1` exactly when the suffix is `-drafts`, and refuses to build or tag a prod image with drafts. A drafts build never carries prod's tag ([resume-source.md §5](resume-source.md#5-approvals)) |
| The policy from `main` | `web_image.py` reads `main`'s `assets/policy/content-approvals.json` and `assets/policy/resume-header.json` on the host, with `git -C <repo> show main:<path>` (`<repo>` is the working tree make passes it, as it passes preflight's `--repo`). It writes them to a fresh temporary directory and gives that to the build as a named build context, `policy`. The build stage reads only that directory and never runs git: a host stack's context is a `git archive` export, and `.dockerignore` drops `.git`. A missing file on `main` is written as absent, so every content file builds as a draft and the PDF gets the room's header. The two files' digest goes into the image's label `org.h4reet.web.policy` and `room-data.json`'s `built_from` |
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
Permissions-Policy: microphone=(), camera=(), geolocation=()
X-Content-Type-Options: nosniff
Cache-Control: public, max-age=31536000, immutable      (hashed assets)
Cache-Control: no-cache                                  (index.html, room-data.json, room-manifest.json, resume.pdf)
```

No `Set-Cookie`, ever. The microphone stays `()` until push-to-talk's group (Phase 8) builds capture; that group changes it to `microphone=(self)`.

## 4. Environment and preflight

- **The keys:** `H4_SITE_PORT`, fixed per stack as above, and `H4_WEB_SUFFIX`, empty on prod and `-drafts` on dev and dev-cpu, join the env templates (`prod.env.example`, `dev.env.example`) and `dev-cpu.vars`. `make init-env SYNC=1` appends them to an existing env file.
- **Preflight** checks `H4_SITE_PORT` as the other five port keys (the stack's value, and free on 127.0.0.1), and refuses an `H4_WEB_SUFFIX` other than empty on `H4_ENV=prod`, or other than `-drafts` on `H4_ENV=dev`.
- **The compose policy:** its port rule already allows any publication on `edge` bound to the literal 127.0.0.1 (`tools/gates/compose_policy.py`, "Ports: edge alone publishes, on the literal 127.0.0.1"), so x005 needs no change there. What it refuses is the `web` image: `SHARED_IMAGES` lists only the gateway's. The patch adds `"web": "h4reet-web:${H4_REF:-working-tree}${H4_WEB_SUFFIX}"`.

## 5. Spec 001

When spec 001's edge exists, its site bucket gets the same `apps/web/dist/`, and its CloudFront response headers policy carries §3's headers. Its relay forwards `/api/room/events` with its public cap. These are changes to spec 001's draft plan, recorded in this spec's note:
- its §8.1 placeholder site becomes this build;
- its `make release` refuses a build whose `room-data.json` lists any draft, or whose `room-manifest.json` says `placeholders: true`;
- its local `edge` tunnel block 8085, which accepts only `POST /hello` and `GET /health`, opens `POST /api/room/events` too, so events from public visits reach the local gateway.
