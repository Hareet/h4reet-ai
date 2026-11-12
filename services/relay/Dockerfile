# The relay's image (spec 001 tasks.md T106; contracts/relay-http.md), the gateway's base and its shape: built once per
# release by deploy/scripts/release.py, for linux/amd64 and linux/arm64, with the repository root as its context, and
# pulled on the tunnel end by its digest. dev-cpu's dev-relay builds it from the tree (deploy/compose.yaml).
#
# Both stages use the same base, pinned by digest. There is no `# syntax=` line: it would pull an unpinned frontend.

# ---- build: install with the lockfile, compile, then drop the dev dependencies ----
FROM public.ecr.aws/docker/library/node:24.21.0-trixie-slim@sha256:173f125896c3b47ddf056734c7ea789d04595a6a08769a8f78e0df642781fb66 AS build
# On the agents' engine npm reaches the registry only through the egress proxy, as HTTP_PROXY and HTTPS_PROXY, Docker's
# predefined build arguments, which stay out of the image history; the runtime stage has no RUN.
ENV NPM_CONFIG_UPDATE_NOTIFIER=false NPM_CONFIG_FUND=false NPM_CONFIG_AUDIT=false
WORKDIR /src
COPY package.json package-lock.json ./
COPY services/relay/package.json services/relay/
RUN npm ci --ignore-scripts --workspace services/relay --include-workspace-root=false
COPY tsconfig.base.json ./
COPY services/relay/tsconfig.json services/relay/tsconfig.build.json services/relay/
COPY services/relay/src services/relay/src
RUN npm run build -w services/relay \
 && npm prune --omit=dev --ignore-scripts --workspace services/relay --include-workspace-root=false \
 && mkdir -p /out/services/relay \
 && cp -a node_modules /out/node_modules \
 && cp -a services/relay/package.json services/relay/dist /out/services/relay/ \
 && if [ -d services/relay/node_modules ]; then cp -a services/relay/node_modules /out/services/relay/; fi

# ---- runtime: the compiled relay and its production dependencies, as the node user ----
FROM public.ecr.aws/docker/library/node:24.21.0-trixie-slim@sha256:173f125896c3b47ddf056734c7ea789d04595a6a08769a8f78e0df642781fb66
ENV NODE_ENV=production
COPY --from=build /out /app
WORKDIR /app/services/relay
# config/budgets.yaml arrives read-only at /app/config/budgets.yaml, from the release's tree.
USER node
EXPOSE 8080 8081 8082
CMD ["node", "dist/server.js"]
