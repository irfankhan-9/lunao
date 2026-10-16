# Production Dockerfile for Lunao Backend on Google Cloud Run
FROM node:22-slim AS builder

WORKDIR /app

# Copy package manifests
COPY package*.json ./
COPY lunaoownerpwa/package*.json ./lunaoownerpwa/

# Install all dependencies required for build
RUN npm ci

# Copy source tree
COPY . .

# Build both Owner PWA and main dashboard frontend into /dist
RUN npm run build

# Production runtime stage
FROM node:22-slim AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=8080

# Copy runtime files from builder
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/lunaoownerpwa/dist ./lunaoownerpwa/dist
COPY --from=builder /app/server ./server
COPY --from=builder /app/public ./public
COPY --from=builder /app/server.ts ./server.ts

# Ensure user node owns the app directory
USER node

# Default port for Cloud Run is 8080 (injected automatically via $PORT)
EXPOSE 8080

# Lightweight health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD node -e "fetch('http://localhost:' + (process.env.PORT || 8080) + '/api/health').then(r => r.ok ? process.exit(0) : process.exit(1)).catch(() => process.exit(1))"

# Run the standard Lunao Express server
CMD ["node", "server/index.js"]
