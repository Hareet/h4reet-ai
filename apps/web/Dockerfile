# The room's image (spec 002, plan §1; contracts/web-serving.md §1 and §3; tasks.md T006). Built outside compose by
# deploy/scripts/web_image.py, with the repository root as its context: on a host stack the run's export of the
# commit, on dev-cpu the working tree. deploy/compose.yaml names it h4reet-web:<ref><suffix> and never builds or pulls
# it. .dockerignore keeps .git, env files, node_modules, dist, and dist-phone out, and assets/policy but its caps.json
# (spec 004, contracts/serving.md §3; its plan.md §10) and its approvals.json (spec 016, plan.md R-03).
#
# Every base is pinned by digest, as deploy/images.lock pins it (base:node, and edge's nginx-unprivileged). There is
# no `# syntax=` line: it would pull an unpinned frontend image.

# ---- policy: main's approvals, the PDF's header, and the room's caps, as web_image.py read them on the host ----
# web_image.py replaces this stage with the named build context `policy`, a directory holding the files main has:
# content-approvals.json, resume-header.json, and spec 004's caps.json (its contracts/serving.md §3). A build that
# names none, such as the gate's image step or the lookdev phone copy, gets this empty stage: every content file builds
# as a draft, the room's compositor takes its caps from the commit's own assets/policy/caps.json, which the install
# stage copies (spec 004, T328), and nothing is pulled under that name. Nothing below runs git
# (contracts/web-serving.md §1).
FROM scratch AS policy

# ---- room-assets: the tree's assets/room, as web_image.py hands it over ----
# web_image.py replaces this stage with the named build context `room-assets` when the tree has models. A build that
# names none, such as the gate's image step, gets this empty stage, and every piece builds as its stand-in.
FROM scratch AS room-assets

# ---- visitor-assets: the tree's assets/visitors, as web_image.py hands it over (spec 009, FR-023) ----
# web_image.py replaces this stage with the named build context `visitor-assets` when the tree has the folder. A build
# that names none gets this empty stage, and both figures build as their fallbacks.
FROM scratch AS visitor-assets

# ---- twin-assets: the tree's assets/twin, as web_image.py hands it over (spec 016, FR-048) ----
# web_image.py replaces this stage with the named build context `twin-assets` when the tree has the folder. A build
# that names none gets this empty stage, and the twin's figure shows its stand-in.
FROM scratch AS twin-assets

# ---- ui-assets: the tree's assets/ui, as web_image.py hands it over (spec 030, FR-027) ----
# web_image.py (and release.py, from its ASSET_CONTEXTS) replaces this stage with the named build context `ui-assets`
# when the tree has the folder. A build that names none, such as the gate's image step, gets this empty stage, and the
# buttons build on their CSS skin.
FROM scratch AS ui-assets

# ---- install: the workspace's dependencies from the lockfile, and what the builds read ----
FROM public.ecr.aws/docker/library/node:24.21.0-trixie-slim@sha256:173f125896c3b47ddf056734c7ea789d04595a6a08769a8f78e0df642781fb66 AS install
# On the agents' engine npm reaches the registry only through the egress proxy: web_image.py passes H4_BUILD_PROXY as
# the HTTP_PROXY and HTTPS_PROXY build arguments, Docker's predefined proxy arguments, which RUN sees without an ARG
# line and which stay out of the image history. On host stacks they are empty.
ENV NPM_CONFIG_UPDATE_NOTIFIER=false NPM_CONFIG_FUND=false NPM_CONFIG_AUDIT=false
WORKDIR /src
COPY package.json package-lock.json ./
COPY apps/web/package.json apps/web/
# Only the room's workspace: npm skips the others, whose package.json files aren't in this stage.
RUN npm ci --ignore-scripts -w apps/web
COPY tsconfig.base.json ./
COPY docs/data-flow-disclosure.md docs/
# Spec 016 (FR-042): the credits page's source, which build/credits.ts renders into dist/credits/.
COPY assets/CREDITS.md assets/CREDITS.md
# The resume's citation check reads the corpus it cites (build/content.ts). .dockerignore keeps corpus/intake/private,
# the Author's denylist and uncleared sources, out of every context, so C9 here checks the public list only.
COPY corpus corpus
# The twin's readiness and limits, which the room's build reads from the tree (spec 007; FR-030, FR-037; its plan.md's
# D44): build/room/readiness.ts applies the gateway's rule to the same files, the Author's config/twin-readiness.yaml
# against the pack's hashes and the prompt's over prompt.md and lines.yaml, so a topic is ready in the image's room
# exactly when it is in a checkout's build; and config/budgets.yaml's limits.twin gives the text box its limits
# (FR-027). Spec 012's loader hints fill their figures from config/budgets.yaml, config/routing.yaml, and
# config/prices.yaml (build/room/hints.ts; its FR-033), so the image's hints equal a checkout's. These seven files and
# no other part of config/ (test/room/image-inputs.test.ts); none of them reaches the runtime stage, which copies only
# dist/.
COPY config/twin-readiness.yaml config/budgets.yaml config/routing.yaml config/prices.yaml config/
COPY config/twin/corpus.json config/twin/prompt.md config/twin/lines.yaml config/twin/
COPY apps/web apps/web
# The room's caps for a build whose policy context holds none: build/room/policy.ts reads the tree's own copy only
# where ROOM_POLICY_DIR holds no caps.json, so web_image.py's context, main's caps, wins wherever it is named. Spec
# 003's rule A9 refuses a branch that changes assets/policy/, so this copy is main's at the commit's base. The caps
# alone: the approvals and the PDF's header come from the policy context or not at all (spec 004, T328).
COPY assets/policy/caps.json assets/policy/caps.json
# Spec 016 (FR-015; plan.md R-03): the likeness approvals, which the room reads the twin's line from, the same way: the
# policy context's where it holds them, else this copy, which rule A9 holds to main's at the commit's base.
COPY assets/policy/approvals.json assets/policy/approvals.json
COPY --from=policy / /src/policy/

# ---- build: the static site ----
FROM install AS build
# The room's models, where the compositor reads them in a checkout, assets/room/: the commit's own, each through the
# arrival check, or none (spec 004, contracts/serving.md §3). The build writes their gzip-9 copies into dist/a/, and
# the runtime stage copies only dist/, so no plain model, record, or license file reaches nginx's root. The lookdev
# phone copy's stage builds on install, not on this stage, and holds no model.
COPY --from=room-assets / /src/assets/room/
# The visitor avatars, where the compositor reads them, assets/visitors/: the commit's own, or none (spec 009, FR-023).
# The build writes their bundled files' gzip-9 copies into dist/a/ beside the models.
COPY --from=visitor-assets / /src/assets/visitors/
# The twin's own avatar, where the compositor reads it, assets/twin/: the commit's own, or none (spec 016, FR-048). The
# build writes its GLBs' gzip-9 copies and its still into dist/a/; no plain model, record, or notice reaches nginx.
COPY --from=twin-assets / /src/assets/twin/
# The buttons' images, where the skin's build reads them, assets/ui/: the commit's own, or none (spec 030, FR-027). The
# build inlines them into the stylesheet as data: URIs; no plain image or record reaches nginx's root.
COPY --from=ui-assets / /src/assets/ui/
# ROOM_DRAFTS is 1 for the -drafts images of dev and dev-cpu, and empty for prod's (contracts/web-serving.md §1).
# ROOM_POLICY_DIR is where the build reads main's policy from, and nowhere else. --ignore-scripts keeps a checkout's
# prebuild (build/policy.ts, which reads main with git) from running here: the context already holds main's policy.
ARG ROOM_DRAFTS=
# dist/resume.pdf.txt, the PDF's text, is for the gate's scan of dist/: with the PDF's full header filled it would put
# the name and contact in crawlable plain text, so it never reaches the runtime stage (nginx.conf refuses it as well).
RUN ROOM_DRAFTS="$ROOM_DRAFTS" ROOM_POLICY_DIR=/src/policy npm run --ignore-scripts build -w apps/web \
 && printf 'ok\n' > apps/web/dist/healthz \
 && rm -f apps/web/dist/*.pdf.txt

# ---- lookdev-phone: the lookdev page's phone copy, drafts only (spec 004; FR-066, FR-069; contracts/lookdev.md §7) ----
# Built only by name, in the Author's terminal, from a commit's git archive export (contracts/lookdev.md §7.3):
#   git --no-replace-objects archive <commit> | docker build -f apps/web/Dockerfile --target lookdev-phone \
#     --output type=local,dest=<a new, empty folder outside the repository> -
# The first stage builds the copy on the install the site's build runs on, with drafts on, reading the policy from
# the named context, which a build that names none gets empty (nothing approved, and the room's caps the commit's own);
# the second holds only lookdev.html, which --output type=local exports as the folder's one file. No other stage
# copies from either, and web_image.py names no target, so its images end at the runtime stage below and never hold
# the copy (contracts/lookdev.md §8, layer 5).
FROM install AS lookdev-phone-build
RUN ROOM_DRAFTS=1 ROOM_POLICY_DIR=/src/policy npm run --ignore-scripts build:lookdev-phone -w apps/web
FROM scratch AS lookdev-phone
COPY --from=lookdev-phone-build /src/apps/web/dist-phone/lookdev.html /lookdev.html

# ---- runtime: nginx, unprivileged, with the built site and its own configuration; last, so the default target ----
FROM ghcr.io/nginx/nginx-unprivileged:1.30.5-alpine@sha256:15c994d10d6d78658721c3bcafff14cb281fba2a4bdf9d5ba92c416a472516e3
COPY apps/web/nginx.conf /etc/nginx/nginx.conf
COPY --from=build /src/apps/web/dist /usr/share/nginx/html
EXPOSE 8080
# nginx itself, without the image's entrypoint scripts, which try to rewrite files on a read-only root.
ENTRYPOINT ["nginx"]
CMD ["-g", "daemon off;"]
