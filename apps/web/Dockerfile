# The room's image (spec 002, plan §1; contracts/web-serving.md §1 and §3; tasks.md T006). Built outside compose by
# deploy/scripts/web_image.py, with the repository root as its context: on a host stack the run's export of the
# commit, on dev-cpu the working tree. deploy/compose.yaml names it h4reet-web:<ref><suffix> and never builds or pulls
# it. .dockerignore keeps .git, env files, node_modules, and dist out.
#
# Every base is pinned by digest, as deploy/images.lock pins it (base:node, and edge's nginx-unprivileged). There is
# no `# syntax=` line: it would pull an unpinned frontend image.

# ---- policy: main's approvals and the PDF's header, as web_image.py read them on the host ----
# web_image.py replaces this stage with the named build context `policy`, a directory holding the files main has. A
# build that names none, such as the gate's, gets this empty stage: every content file builds as a draft, and nothing
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
COPY apps/web apps/web
COPY --from=policy / /src/policy/
# ROOM_DRAFTS is 1 for the -drafts images of dev and dev-cpu, and empty for prod's (contracts/web-serving.md §1).
# ROOM_POLICY_DIR is where the build reads main's policy from, and nowhere else.
ARG ROOM_DRAFTS=
RUN ROOM_DRAFTS="$ROOM_DRAFTS" ROOM_POLICY_DIR=/src/policy npm run build -w apps/web \
 && printf 'ok\n' > apps/web/dist/healthz

# ---- runtime: nginx, unprivileged, with the built site and its own configuration ----
FROM ghcr.io/nginx/nginx-unprivileged:1.30.5-alpine@sha256:15c994d10d6d78658721c3bcafff14cb281fba2a4bdf9d5ba92c416a472516e3
COPY apps/web/nginx.conf /etc/nginx/nginx.conf
COPY --from=build /src/apps/web/dist /usr/share/nginx/html
EXPOSE 8080
# nginx itself, without the image's entrypoint scripts, which try to rewrite files on a read-only root.
ENTRYPOINT ["nginx"]
CMD ["-g", "daemon off;"]
