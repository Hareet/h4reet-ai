# The room's image (spec 002, plan §1; contracts/web-serving.md §1 and §3; tasks.md T006). Built outside compose by
# deploy/scripts/web_image.py, with the repository root as its context: on a host stack the run's export of the
# commit, on dev-cpu the working tree. deploy/compose.yaml names it h4reet-web:<ref><suffix> and never builds or pulls
# it. .dockerignore keeps .git, env files, node_modules, and dist out.
#
# Every base is pinned by digest, as deploy/images.lock pins it (base:node, and edge's nginx-unprivileged). There is
# no `# syntax=` line: it would pull an unpinned frontend image.

# ---- policy: main's approvals, the PDF's header, and the room's caps, as web_image.py read them on the host ----
# web_image.py replaces this stage with the named build context `policy`, a directory holding the files main has:
# content-approvals.json, resume-header.json, and spec 004's caps.json (its contracts/serving.md §3). A build that
# names none, such as the gate's, gets this empty stage: every content file builds as a draft, the room's compositor
# takes FR-053's starting figures with every model a stand-in, as it does whenever main lacks caps.json, and nothing
# is pulled under that name. Nothing below runs git (contracts/web-serving.md §1).
FROM scratch AS policy

# ---- build: the workspace's dependencies from the lockfile, then the static site ----
FROM public.ecr.aws/docker/library/node:24.21.0-trixie-slim@sha256:173f125896c3b47ddf056734c7ea789d04595a6a08769a8f78e0df642781fb66 AS build
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
# The resume's citation check reads the corpus it cites (build/content.ts). .dockerignore keeps corpus/intake/private,
# the Author's denylist and uncleared sources, out of every context, so C9 here checks the public list only.
COPY corpus corpus
COPY apps/web apps/web
COPY --from=policy / /src/policy/
# ROOM_DRAFTS is 1 for the -drafts images of dev and dev-cpu, and empty for prod's (contracts/web-serving.md §1).
# ROOM_POLICY_DIR is where the build reads main's policy from, and nowhere else. --ignore-scripts keeps a checkout's
# prebuild (build/policy.ts, which reads main with git) from running here: the context already holds main's policy.
ARG ROOM_DRAFTS=
# dist/resume.pdf.txt, the PDF's text, is for the gate's scan of dist/: with the PDF's full header filled it would put
# the name and contact in crawlable plain text, so it never reaches the runtime stage (nginx.conf refuses it as well).
RUN ROOM_DRAFTS="$ROOM_DRAFTS" ROOM_POLICY_DIR=/src/policy npm run --ignore-scripts build -w apps/web \
 && printf 'ok\n' > apps/web/dist/healthz \
 && rm -f apps/web/dist/*.pdf.txt

# ---- runtime: nginx, unprivileged, with the built site and its own configuration ----
FROM ghcr.io/nginx/nginx-unprivileged:1.30.5-alpine@sha256:15c994d10d6d78658721c3bcafff14cb281fba2a4bdf9d5ba92c416a472516e3
COPY apps/web/nginx.conf /etc/nginx/nginx.conf
COPY --from=build /src/apps/web/dist /usr/share/nginx/html
EXPOSE 8080
# nginx itself, without the image's entrypoint scripts, which try to rewrite files on a read-only root.
ENTRYPOINT ["nginx"]
CMD ["-g", "daemon off;"]
