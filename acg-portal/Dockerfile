# ─── ACG Investor Portal — production image ──────────────────────────────────
# Multi-stage build producing a minimal standalone Next.js server.
# Prisma engines download normally outside the sandboxed dev environment.

FROM node:22-bookworm-slim AS base
ENV NEXT_TELEMETRY_DISABLED=1
WORKDIR /app

# ── deps ──────────────────────────────────────────────────────────────────
FROM base AS deps
RUN apt-get update -y && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json* ./
RUN npm ci

# ── build ─────────────────────────────────────────────────────────────────
FROM base AS builder
RUN apt-get update -y && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# `build` runs `prisma generate && next build`
RUN npm run build

# ── runner ────────────────────────────────────────────────────────────────
FROM base AS runner
ENV NODE_ENV=production
# ca-certificates: lets Prisma verify a managed Postgres's TLS certificate
# (DATABASE_URL ...&sslaccept=strict).
RUN apt-get update -y && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
RUN addgroup --system --gid 1001 nodejs && adduser --system --uid 1001 nextjs

COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
# Prisma schema, migrations, and generated client for `migrate deploy` at release.
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/node_modules/@prisma ./node_modules/@prisma
COPY --from=builder /app/node_modules/prisma ./node_modules/prisma
COPY --from=builder /app/scripts/container-start.mjs ./scripts/container-start.mjs

USER nextjs
EXPOSE 3000
ENV PORT=3000 HOSTNAME=0.0.0.0

# Runs pending migrations (unless MIGRATE_ON_START=0), then the standalone
# server. See scripts/container-start.mjs.
CMD ["node", "scripts/container-start.mjs"]
