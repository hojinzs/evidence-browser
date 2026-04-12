FROM node:20-alpine AS builder
RUN apk add --no-cache python3 make g++
WORKDIR /app
COPY package*.json ./
COPY packages/legacy/package.json ./packages/legacy/
COPY packages/shared/package.json ./packages/shared/
RUN npm ci --include=dev
RUN npm rebuild better-sqlite3 --build-from-source
COPY . .
RUN npm -w @evidence-browser/shared run build
RUN npm -w @evidence-browser/legacy run build

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

COPY --from=builder /app/packages/legacy/.next/standalone ./
COPY --from=builder /app/packages/legacy/.next/static ./.next/static
COPY --from=builder /app/packages/legacy/public ./public
COPY --from=builder /app/node_modules/better-sqlite3 ./node_modules/better-sqlite3
COPY --from=builder /app/node_modules/@node-rs ./node_modules/@node-rs

RUN mkdir -p /data/bundles && chown -R nextjs:nodejs /data
VOLUME /data
USER nextjs
EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"
ENV DATA_DIR=/data
ENV STORAGE_LOCAL_PATH=/data/bundles
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s \
  CMD wget --no-verbose --tries=1 --spider http://127.0.0.1:3000/api/health || exit 1
CMD ["node", "server.js"]
