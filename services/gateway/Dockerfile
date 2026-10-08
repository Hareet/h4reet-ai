# The gateway's image (plan §2; tasks.md T028). Built from the repository root as its context: in
# deploy/compose.yaml the gateway's build.context is `..`, relative to the compose file, so on a host stack it
# resolves inside the run's export of the commit, and on dev-cpu inside the working tree. The compose policy
# (tasks.md T037) refuses any other context. .dockerignore keeps .git, env files, node_modules, and dist out.
#
# Both stages use the same base, pinned by digest. There is no `# syntax=` line: it would pull an unpinned
# frontend image.

# ---- build: install with the lockfile, compile, then drop the dev dependencies ----
FROM public.ecr.aws/docker/library/node:24.21.0-trixie-slim@sha256:173f125896c3b47ddf056734c7ea789d04595a6a08769a8f78e0df642781fb66 AS build
# On the agents' engine npm reaches the registry only through the egress proxy: compose passes H4_BUILD_PROXY as
# the HTTP_PROXY and HTTPS_PROXY build arguments (contracts/env-files.md §2). Those are Docker's predefined proxy
# arguments, which RUN sees without an ARG line, so they stay out of the image history; the runtime stage has no
# RUN, and its environment never holds them. On host stacks they are empty.
ENV NPM_CONFIG_UPDATE_NOTIFIER=false NPM_CONFIG_FUND=false NPM_CONFIG_AUDIT=false
WORKDIR /src
COPY package.json package-lock.json ./
COPY services/gateway/package.json services/gateway/
RUN npm ci --ignore-scripts
COPY tsconfig.base.json ./
COPY services/gateway/tsconfig.json services/gateway/tsconfig.build.json services/gateway/
COPY services/gateway/src services/gateway/src
RUN npm run build -w services/gateway \
 && npm prune --omit=dev --ignore-scripts \
 && mkdir -p /out/services/gateway \
 && cp -a node_modules /out/node_modules \
 && cp -a services/gateway/package.json services/gateway/dist /out/services/gateway/ \
 && if [ -d services/gateway/node_modules ]; then cp -a services/gateway/node_modules /out/services/gateway/; fi

# ---- runtime: the compiled gateway, its production dependencies, and its migrations, as the node user ----
FROM public.ecr.aws/docker/library/node:24.21.0-trixie-slim@sha256:173f125896c3b47ddf056734c7ea789d04595a6a08769a8f78e0df642781fb66
ENV NODE_ENV=production
COPY --from=build /out /app
COPY services/gateway/migrations /app/services/gateway/migrations
WORKDIR /app/services/gateway
# The configuration arrives read-only at /app/config, and the state directory at /var/lib/h4-gateway (plan §2).
USER node
EXPOSE 8080 8081
CMD ["node", "dist/server.js"]
