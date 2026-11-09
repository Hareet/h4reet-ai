# ADR 0033: The room's stack: `apps/web`, Vite, Three.js, no framework

Status: proposed, 2026-10-18 · Spec: 002 (FR-057, FR-059; plan §1; research.md R-01 to R-03, R-09, R-15)

## Context

Spec 002 builds the room: the choice screen, a 3D work area, the interactive resume, its PDF, and the fixed messages the room shows while the twin doesn't exist. CLAUDE.md's Architecture names `apps/web` as "static site + 3D room (Three.js), served from the edge". Spec 001's draft plan, not implemented, planned a placeholder `apps/web` of its own. Spec 000 pinned Vite 8.3.3 and vitest 5.0.3 with the gateway's toolchain.

The Author's direction of 2026-10-17 was to take the plan's recommended options and revisit any of them later: "Let's relax some of the overnight rules so that you can continue with intent 002 and intent 003? I think you can create the tasks and implement them and we can always go back later and re-do a task or requirement if we highlight a needed change". This ADR records the recommendation taken for research.md's decisions 1 and 2.

## Decision

- **One workspace, `apps/web`,** beside `services/*`: the root `package.json`'s `workspaces` gains `"apps/*"`, and the workspace uses the repository's TypeScript, ESLint, Prettier, and vitest setup. `make lint` and `make test` cover it with the existing tools.
- **Vite builds it** into `apps/web/dist/`, a static site with relative URLs only, so the same files serve from any path on the site's own origin (FR-057).
- **Plain TypeScript and DOM APIs** for the interface, with no UI framework. The room's handful of screens are each a module, and their accessibility rests on plain HTML elements.
- **Three.js renders the scene** into a canvas marked `aria-hidden`. Every selectable object is also an HTML button, which is what keyboards and screen readers use (FR-043 to FR-045).
- **Dependencies are pinned exactly** in the lockfile, from the npm registry, at the newest stable release published at least two weeks before the pin. Phase 1 pins `three` 0.186.1 with `@types/three` 0.186.0, `jsdom` 30.1.1 with `@types/jsdom` 30.0.0, and `axe-core` 4.13.0. All are development dependencies: the browser gets Vite's bundle, and the `web` image holds only `dist/`, so none of them is in any image's runtime.
- **The site is served** on each stack by a `web` service, nginx with the built site baked in, behind the stack's `edge` on a sixth loopback port, x005 (research.md R-09; contracts/web-serving.md). `deploy/scripts/web_image.py` builds that image outside compose on every `make up`, as `gateway_image.py` builds the gateway's, except that its tag carries the drafts flag and it bakes in `main`'s content policy as it stood.

## Alternatives considered

- **A separate workspace per spec** (`apps/room`, `apps/site`). Rejected: two static builds on one origin, and two copies of the same accessibility and font setup.
- **React or Svelte.** Rejected for now: comfortable for larger interfaces, but a dependency and a runtime for a small one. React Three Fiber would couple the scene to React.
- **Babylon.js.** Rejected: larger, with its own accessibility helpers, but CLAUDE.md names Three.js.
- **A scene of HTML and CSS 3D transforms.** Rejected: accessible by construction, but it can't hold avatars and their animations.
- **Mounting `dist/` from the working tree into `edge`,** or Vite's development server in a container. Rejected: the served site would drift from the commit the stack runs, or a development tool would run in production.

## Consequences

- Cost: $0. The site is static, and nothing in it calls a model.
- Supply chain: the libraries the bundle or the build uses (`three` now, `pdfkit` with the resume) and the test tools come from the npm registry, pinned exactly. A new pin is a lockfile change in review.
- Size: the choice screen's JavaScript stays under 150 KB compressed before the 3D chunk, which loads behind the choice (SC-005; plan, Performance Goals).
- Degraded mode: the site needs no model and no gateway. With `web` down, the stack's `edge` answers x005 with its own 503 page, and nothing else waits on `web`.
- Spec 001's draft plan builds its placeholder site on `apps/web` instead of creating one; its edge serves the same `dist/` with the same headers (contracts/web-serving.md §5).
- Data flows: the site's static files are disclosure row V1, loopback only until spec 001, and the `web` service is row S14.

## Links

- Intent: [the room's intent](../../specs/002-the-room/intent.md)
- Spec: [002 spec](../../specs/002-the-room/spec.md) · Plan: [plan.md](../../specs/002-the-room/plan.md) · Research: [research.md](../../specs/002-the-room/research.md) · Contract: [web-serving.md](../../specs/002-the-room/contracts/web-serving.md)
- Merge request, in place of a PR until publication: [2026-10-18 note](../merge-requests/2026-10-18-feat-002-web.md)
- Related: [ADR 0002](0002-one-compose-topology-for-every-environment.md), [ADR 0021](0021-internal-network-prometheus-loki-edge.md)
