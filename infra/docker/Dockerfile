# Aurora Business OS — single image for the demo / evaluation stack.
#
# Build context is the repository root:
#   docker build -f infra/docker/Dockerfile .
#
# One image serves three roles (selected by the compose `command`):
#   migrate : apply SQL migrations as the admin role, then seed the DEMO dataset (idempotent)
#   api     : node apps/api/dist/main.js
#   web     : next start
#
# This is an evaluation image: it ships the whole built workspace (dev dependencies included)
# so that migrations, seed, API and web all run from one artifact. A production image would
# use `pnpm deploy --prod` per app and Next.js standalone output; that is deliberately a later
# slice (see docs/progress.md).

ARG NODE_IMAGE=node:22-bookworm-slim

# ------------------------------------------------------------------------------ dependencies
FROM ${NODE_IMAGE} AS deps
ENV CI=true PNPM_HOME=/pnpm PATH=/pnpm:$PATH
RUN corepack enable && corepack prepare pnpm@10.28.0 --activate
WORKDIR /app
# Manifests first so dependency installation is cached independently of source changes.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY apps/worker/package.json apps/worker/
COPY packages/types/package.json packages/types/
COPY packages/sdk/package.json packages/sdk/
COPY packages/ui/package.json packages/ui/
COPY packages/config/package.json packages/config/
RUN pnpm install --frozen-lockfile

# ------------------------------------------------------------------------------ build
FROM deps AS build
COPY . .
# A Windows checkout may have CRLF endings; shell scripts run inside the container must be LF.
RUN sed -i 's/\r$//' infra/docker/*.sh
ENV NEXT_TELEMETRY_DISABLED=1
RUN pnpm build

# ------------------------------------------------------------------------------ runtime
FROM ${NODE_IMAGE} AS runtime
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1
WORKDIR /app
COPY --from=build /app /app
# Unprivileged user; the image owns nothing it needs to write to at runtime except .next/cache.
RUN groupadd --system aurora && useradd --system --gid aurora --home /app aurora \
  && mkdir -p apps/web/.next/cache && chown -R aurora:aurora apps/web/.next
USER aurora
EXPOSE 3000 4000
CMD ["node", "apps/api/dist/main.js"]
