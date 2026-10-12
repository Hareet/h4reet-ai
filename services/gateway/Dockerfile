# The gateway's image (plan §2 and §4; tasks.md T028, T184). Built once per commit, outside compose, by
# deploy/scripts/gateway_image.py, with the repository root as its context: on a host stack the run's export of the
# commit, as h4reet-gateway:<commit>, which prod and dev share; on dev-cpu the working tree, as
# h4reet-gateway:working-tree. deploy/compose.yaml names that image and never builds or pulls it. .dockerignore keeps
# .git, env files, node_modules, and dist out.
#
# Both stages use the same base, pinned by digest. There is no `# syntax=` line: it would pull an unpinned
# frontend image.

# ---- build: install with the lockfile, compile, then drop the dev dependencies ----
FROM public.ecr.aws/docker/library/node:24.21.0-trixie-slim@sha256:173f125896c3b47ddf056734c7ea789d04595a6a08769a8f78e0df642781fb66 AS build
# On the agents' engine npm reaches the registry only through the egress proxy: the build passes H4_BUILD_PROXY as
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
