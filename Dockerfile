FROM node:20-alpine AS builder
RUN apk add --no-cache python3 make g++
WORKDIR /app
COPY package*.json ./
COPY packages/api/package.json ./packages/api/
COPY packages/cli/package.json ./packages/cli/
COPY packages/shared/package.json ./packages/shared/
COPY packages/web/package.json ./packages/web/
RUN npm ci --include=dev
RUN if [ "$(apk --print-arch)" = "aarch64" ]; then \
      npm install --no-save \
        @rolldown/binding-linux-arm64-musl@1.0.0-rc.15 \
        @tailwindcss/oxide-linux-arm64-musl@4.2.2 \
        lightningcss-linux-arm64-musl@1.32.0 \
        @node-rs/argon2-linux-arm64-musl@2.0.2 \
        @node-rs/crc32-linux-arm64-musl@1.10.6; \
    fi
RUN npm rebuild better-sqlite3 --build-from-source
COPY . .
RUN npm -w @evidence-browser/shared run build
RUN npm -w @evidence-browser/api run build
RUN npm -w @evidence-browser/web run build

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 appuser

# Copy package manifests for npm prune
COPY package*.json ./
COPY packages/api/package.json ./packages/api/
COPY packages/cli/package.json ./packages/cli/
COPY packages/shared/package.json ./packages/shared/
COPY packages/web/package.json ./packages/web/

# Copy node_modules from builder (includes pre-compiled native modules)
COPY --from=builder /app/node_modules ./node_modules

# Remove dev dependencies
RUN npm prune --omit=dev
RUN if [ "$(apk --print-arch)" = "aarch64" ]; then \
      npm install --omit=dev --no-save \
        @node-rs/argon2-linux-arm64-musl@2.0.2 \
        @node-rs/crc32-linux-arm64-musl@1.10.6; \
    fi

# Copy compiled Hono API.
COPY --from=builder /app/packages/api/dist ./dist

# npm workspaces link @evidence-browser/shared to packages/shared. The production
# API imports its package exports from that workspace, so ship the compiled shared
# package alongside the API instead of only its manifest.
COPY --from=builder /app/packages/shared/dist ./packages/shared/dist

# Copy compiled Vite SPA at the same canonical path served locally
COPY --from=builder /app/packages/web/dist ./packages/web/dist

# Copy shipped demo bundle for the one-click empty-state CTA
COPY --from=builder /app/examples/sample.zip ./examples/sample.zip

RUN mkdir -p /data/bundles && chown -R appuser:nodejs /data
VOLUME /data
USER appuser
EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"
ENV DATA_DIR=/data
ENV STORAGE_LOCAL_PATH=/data/bundles
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s \
  CMD wget --no-verbose --tries=1 --spider http://127.0.0.1:3000/api/health || exit 1
CMD ["node", "dist/api/src/server.js"]
