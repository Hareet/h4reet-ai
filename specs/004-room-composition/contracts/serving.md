# Contract: serving the room's models

Every GLB the site serves goes out gzip-encoded, as the very bytes the caps count. Spec: FR-079, FR-053, FR-057, FR-075; SC-006. Amendments: B14 (spec 002's `specs/002-the-room/contracts/web-serving.md` §1 to §3, on `spec/002-the-room` and the `feat/002-*` branches), A6 (spec 001's `specs/001-cloud-elevation/contracts/releases-deployer.md` §2 step 5 and §4, and `edge.md` §3 and §4, on `spec/001-cloud-elevation`), C11 (spec 003's `specs/003-studio-assets/contracts/site-loading.md` §1, on `spec/003-studio-assets` and the `feat/003-*` branches), and A5's build stage for the release. Plan: [plan.md](../plan.md). Research: [research.md](../research.md) (the gzip measure, and where the models live). The measure itself: [plain-model-fit.md](plain-model-fit.md) §7. The model entries the page reads: [room-bundle.md](room-bundle.md).

The Author's answer during `/speckit-clarify`, on whether to send the models gzip-encoded or count raw bytes: "yes, go with recommended", option A, send them gzip-encoded (the spec's Clarifications). FR-079 keeps the file itself plain: "FR-015's "no … compression" governs what a file holds, not how it is sent."

## 1. The URLs, and the files in `dist/` (FR-079, FR-075, FR-057)

| What | URL | In `dist/` | Bytes served |
|---|---|---|---|
| A GLB: the room's, and the twin's and the avatars' once spec 003's site-loading group emits them | `/a/<stem>.<hash16>.glb` | `a/<stem>.<hash16>.glb.gz`, and no plain `.glb` | the `.gz` file's |
| An image card (FR-053) | `/a/<stem>.<hash16>.<ext>`, `<ext>` being `png`, `jpg`, `jpeg`, or `webp` | the file as committed | its own |

- **The name.** `<stem>` is the record's file name without its extension; `<hash16>` is the first 16 hexadecimal digits of the plain file's SHA-256, which is the record's `sha256` and the hash the Author approved. This is spec 003's scheme (`site-loading.md` §1): a changed file gets a new URL, so a URL's bytes never change.
- **The room's `.gz` copy.** Written once, at build time, by the compositor's Vite plugin, from the tree's `assets/room/<stem>.glb`: pako 2.1.0 at level 9, with a 10-byte header holding no file name, extra field, or comment, MTIME 0, XFL 2, and OS 255. Its length is the measure the caps and the report use ([plain-model-fit.md](plain-model-fit.md) §7). The model itself is never re-encoded, and two builds of one commit write identical copies (FR-010).
- **One file behind one URL.** No plain `.glb` sits beside the copy, so what a client downloads is always what was counted. Every GLB the site serves follows this section, the twin's and the avatars' included (FR-079), so there is one implementation and one measure. The twin's and the avatars' copies are written by spec 003's site-loading group with the same pako 2.1.0 call, `apps/web/src/room/glb/gzip.ts` ([plan.md](../plan.md) §3.2).
- **The integrity check.** The page fetches a model with `integrity` set to the plain file's SHA-256 ([room-bundle.md](room-bundle.md)). The browser checks integrity over the decoded body, so the encoding never trips FR-057's integrity failure; a mismatch there is a real one.
- **Same origin.** Every URL is the site's own (FR-075, spec 002's FR-057).

## 2. The web image's nginx (B14)

### 2.1 The configuration

`apps/web/nginx.conf` (on `feat/002-us6-events`) gains one cache rule and one location; nothing else changes:

```nginx
  map $uri $h4_cache {
    ~^/assets/ "public, max-age=31536000, immutable";
    ~^/a/ "public, max-age=31536000, immutable";
    default "no-cache";
  }
```

```nginx
    # Spec 003's content-addressed files (spec 004, contracts/serving.md): every GLB as its build-time gzip-9 copy,
    # never compressed per request, inflated only for a client that takes no gzip. No add_header here, so the
    # server's headers stay on every response.
    location ^~ /a/ {
      limit_except GET {
        deny all;
      }
      types {
        model/gltf-binary glb;
        image/png png;
        image/jpeg jpg jpeg;
        image/webp webp;
      }
      default_type application/octet-stream;
      gzip_static always;
      gunzip on;
      gzip_vary on;
      location ~ \.gz$ {
        return 404;
      }
    }
```

- **`gzip_static always`** serves `<file>.gz` for `<file>` with `Content-Encoding: gzip`, whatever the client's `Accept-Encoding`, and needs no plain file on disk; **`gunzip on`** inflates it as it is sent to a client that takes no gzip, so every client gets valid bytes. An image card has no `.gz`, so nginx serves it as stored.
- **No `gzip on` anywhere.** Nothing is compressed per request (B14: the image "compresses no GLB per request"), which would cost the image's 0.1 CPU and send bytes the caps don't measure.
- **No `add_header` in the location.** An `add_header` there would replace the server's security headers in it; `Content-Encoding` comes from `gzip_static`, `Vary` from `gzip_vary`, and `Cache-Control` from the map.
- **`types` lists the image types too.** A `types` block inside a location replaces the inherited map there, so every extension `/a/` serves is listed.
- **`^~`** keeps the server's regular-expression locations from taking an `/a/` path, and the location has no `try_files`, since only the `.gz` copy exists on disk and nothing under `/a/` falls back to another file.
- **The `.gz` URL answers 404:** the copy has one public name, the `.glb` one.
- **The modules.** `gzip_static` and `gunzip` must be compiled into the pinned `nginx-unprivileged:1.30.5-alpine` image. A configuration test can't see that, so `nginx -V` in that image is checked once, before the first room model merges (§8, and [quickstart.md](../quickstart.md)).

### 2.2 What a request gets

| Request | Response |
|---|---|
| `GET /a/<stem>.<hash16>.glb` with gzip in `Accept-Encoding`, as every browser sends | 200; `Content-Type: model/gltf-binary`; `Content-Encoding: gzip`; `Content-Length` the `.gz` length; `Vary: Accept-Encoding`; `Cache-Control: public, max-age=31536000, immutable`; and spec 002's server headers: the CSP, `Referrer-Policy`, `Permissions-Policy`, and `X-Content-Type-Options: nosniff` |
| The same, without gzip in `Accept-Encoding` | 200, the plain GLB, inflated as it is sent, with no `Content-Encoding`, and the same type and headers |
| `HEAD` of either | as `GET`, with no body |
| `GET /a/<stem>.<hash16>.glb.gz` | 404 |
| `GET /a/<stem>.<hash16>.png`, `.jpg`, `.jpeg`, or `.webp` | 200, its type, as stored, with no `Content-Encoding` |
| Any other method | 403, from `limit_except` |

## 3. Building the image (B14, FR-013, FR-053)

**`apps/web/Dockerfile`** (on `feat/002-us6-events`) gains an empty stage beside its `policy` stage, and one copy in the build stage, before the build's `RUN`:

```dockerfile
# ---- room-assets: the tree's assets/room, as web_image.py hands it over ----
# web_image.py replaces this stage with the named build context `room-assets` when the tree has models. A build that
# names none, such as the gate's image step, gets this empty stage, and every piece builds as its stand-in.
FROM scratch AS room-assets
```

```dockerfile
COPY --from=room-assets / /src/assets/room/
```

- The compositor reads the models from `/src/assets/room/`, the same repository-relative `assets/room/` it reads in a checkout, and the build writes their `.gz` copies into `dist/a/`. The runtime stage still copies only `dist/`, so no plain model, record, or license file reaches nginx's root.
- **A build without models** (no `room-assets` context: the gate's image step, or a tree with no `assets/room/`) can read no model. Each piece whose catalog entry names one gets RX1 ([plain-model-fit.md](plain-model-fit.md) §5), so the build warns and the piece keeps its stand-in, and the manifest says stand-ins are in use (FR-013): the image still builds, as `make up` needs. The gate's image step has no policy context either, so its caps are absent and every piece stays a stand-in anyway ([plain-model-fit.md](plain-model-fit.md) §8.1).

**`deploy/scripts/web_image.py`** (on `feat/002-us6-events`):
- **The caps join the policy.** `POLICY_FILES` gains `("assets/policy/caps.json", "caps.json")` after the two it holds, read from `refs/heads/main` on the host as they are, into the same named context `policy`. The label `org.h4reet.web.policy` then digests three files, in that order; `apps/web/build/policy.ts`'s `POLICY_PATHS` and `apps/web/build/approvals.ts`'s `POLICY_FILES` (both on `feat/002-us6-events`) gain the file in the same order, so the label and `room-data.json`'s `built_from` agree. A `main` without the file writes it as absent, and the compositor uses FR-053's starting figures with every model a stand-in ([plain-model-fit.md](plain-model-fit.md) §8.1).
- **The models come from the tree it builds.** When `<tree>/assets/room` is a directory, and not a link, in the tree it builds (the export its run file names for prod and dev, the working tree for dev-cpu), it passes `--build-context room-assets=<tree>/assets/room`; otherwise no such argument. Only the policy comes from `main`; the models are the commit's own, each already through the arrival check, whose rule A3 refuses a link inside an asset directory.
- Nothing else changes: no `--ssh`, `--secret`, cache import or export, `--allow`, or `--network`.

**`.dockerignore`** gains `assets/policy`, so the build reads policy only from the named `policy` context, and `**/dist-phone`, so the lookdev page's phone copy never enters a context ([lookdev.md](lookdev.md) §8).

## 4. The stack's edge (B14)

`deploy/edge/nginx.conf`'s x005 listener (on the `feat/002-*` branches) needs no change, and its tests pin why: its `location /` passes the client's `Accept-Encoding` to `web` (it sets no `Accept-Encoding` header of its own), and passes the response's `Content-Encoding` back unchanged, since edge has no `gzip`, `gzip_static`, or `gunzip` directive in any block, and runs with `proxy_buffering off`. The listener keeps its four locations.

## 5. Spec 001's release and CloudFront (A6, A5)

When spec 001's `make release` writes the site (its `releases-deployer.md` §2 step 5), it builds `apps/web/dist/` inside the pinned web build stage with no credentials mounted (A5), so its `.gz` copies are the bytes the image would serve, and it writes them so:
1. **The sync** of `dist/` to `site/` leaves out every `a/*.glb.gz` file and every `a/*.glb` key, so it neither uploads a copy under its own name nor deletes a GLB the next step writes.
2. **Each copy is uploaded on its own:** `dist/a/<stem>.<hash16>.glb.gz`, its bytes unchanged, to the key `site/a/<stem>.<hash16>.glb`, with the object metadata `Content-Encoding: gzip` and `Content-Type: model/gltf-binary`, and the `Cache-Control` the release gives the site's other content-addressed files. A sync sets no per-object metadata, hence the separate pass.
3. **Stale GLB keys** under `site/a/` that the release doesn't hold are then deleted, as the sync deletes other files.
4. **The copies keep the metadata:** the release's copy under `releases/<commit>/`, and a site rollback's copy back to `site/` (`make site-rollback`, `edge.md` §4), so a rollback keeps both headers.
5. **The release reads every GLB object back,** in `site/` and in `releases/<commit>/`, before it invalidates `/*`: `ContentEncoding` `gzip`, `ContentType` `model/gltf-binary`, and `ContentLength` the `.gz` length. Any other answer stops the release.

**CloudFront** (`edge.md` §3, the default behaviour, origin `site`) serves each object as stored, with both headers; it compresses no GLB itself, and an origin response that already carries `Content-Encoding` isn't compressed again. Its `h4-site` response headers policy adds the site's security headers, as for every file.

## 6. The bytes counted (C11)

- For a GLB, `files[].bytes` in spec 003's `assets.json` (`site-loading.md` §1, "its size, for the bytes counted in events") and each model entry's `bytes` in the room's bundle ([room-bundle.md](room-bundle.md)) are the `.gz` copy's length; for an image card, its file's length. So each asset event's `bytes` (spec 003's `specs/003-studio-assets/contracts/asset-events.md`, on the `feat/003-*` branches), and the bytes served on spec 003's FR-039 panel, count the bytes transferred.
- `sha256` stays the plain file's, for the integrity check and the approval.

## 7. What never happens

- A GLB compressed per request, at the web image or at either edge.
- A plain `.glb` beside its copy in `dist/`, or a `.gz` URL that answers.
- An `add_header` below the web image's server block.
- A model, or its copy, served from any origin but the site's own.
- A model's bytes changed by serving: the browser inflates the copy back to the approved file.

## 8. Proof

| Test | Proves | Spec |
|---|---|---|
| `deploy/scripts/test_web_nginx.py` (on `feat/002-us6-events`), extended | the cache map holds exactly its three rules; the `/a/` location holds exactly §2.1's directives (no `try_files`, no `add_header`); no directive named `gzip` in any block; still no nested `add_header`; `limit_except GET` on both `/` and `/a/` | B14, FR-079 |
| `deploy/scripts/test_web_image.py` (on `feat/002-us6-events`), extended | `POLICY_FILES` holds three entries, in order, and the label digests `caps.json`; `--build-context room-assets=<tree>/assets/room` is passed exactly when that path is a directory and not a link; the Dockerfile's `room-assets` stage and its copy come before the build's `RUN`, and the runtime stage copies only `dist/`; `.dockerignore` holds `assets/policy` and `**/dist-phone` | B14, FR-053 |
| `deploy/scripts/test_edge_site.py` (on `feat/002-us6-events`), extended | x005's `location /` sets no `Accept-Encoding` and hides no `Content-Encoding`; no `gzip`, `gzip_static`, or `gunzip` directive anywhere in edge's configuration | B14 |
| `apps/web/test/serving.test.ts` (new): a release build of a fixture tree whose GLBs `test/helpers/glb.ts` makes at run time, since rule A1 refuses a committed model | `dist/a/` holds `.glb.gz` copies and no plain `.glb`; each inflates to bytes whose SHA-256 is the bundle's `sha256` and whose first 16 hexadecimal digits are its URL's; each equals `pako.gzip(plain, {level: 9, header: {time: 0, os: 255}})` byte for byte, with the header bytes `1f 8b 08 00`, MTIME 0, XFL 2, OS 255; each model entry's `bytes` is its copy's length; two builds write identical copies; a build with no models has no `dist/a/` GLB and a manifest that says stand-ins are in use | FR-079, FR-010, FR-013, C11 |
| [plain-model-fit.md](plain-model-fit.md) §7's parity test | the copy's length is the arrival check's gzip-9 measure | FR-079, SC-006 |
| The in-network probe on dev-cpu, through the agents' engine, once the first room model is in the tree ([quickstart.md](../quickstart.md)): a container on the stack's network asks `web:8080` and `edge:8087` for each model's URL, with and without gzip in `Accept-Encoding` | §2.2's table, header by header; the encoded body's length is the bundle's `bytes`, and the inflated body's SHA-256 its `sha256`; the `.gz` URL answers 404 | B14, SC-006 |
| `nginx -V` in the pinned image, once | `--with-http_gzip_static_module` and `--with-http_gunzip_module` | B14 |
| The Author's network log ([quickstart.md](../quickstart.md)): a visit to the room on dev from the Author's desktop browser, and after publication one on the reference phone | 100% of GLB responses carry `Content-Encoding: gzip` | SC-006 |
| After spec 001's release, the Author's check of a GLB's response headers from the public edge ([quickstart.md](../quickstart.md)) | §5: CloudFront serves the stored encoding and type | A6, SC-006 |

## 9. Principles, cost, and the degraded mode

- **Principles touched.** I: no new flow. The spec's disclosure entries: "Not new rows: the room's models, typefaces, and bundle are same-origin static files (spec 002's V1; spec 003's FR-040(a))". V: the bytes a phone downloads are the bytes the caps count, and no request costs compression on the image's 0.1 CPU. IV: no new listener, header, or edge rule.
- **Cost.** The spec's estimate stands, now measured in the bytes actually sent: 1,000 first visits a month at about 12 MB is about 12 GB, under $1.20 at typical CDN rates, possibly $0 inside the free allowance; $0 before publication.
- **The degraded mode.** A client that takes no gzip still gets valid bytes (`gunzip`). A model that is blocked, times out, or fails its integrity check keeps its piece's stand-in after one retry (FR-057). A build with no models, or no caps, builds every piece as its stand-in (§3). A release whose read-back disagrees stops before it invalidates the edge, and says so; `make site-rollback` restores the previous release's copy with both headers (§5).
