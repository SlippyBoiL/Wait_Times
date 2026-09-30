# Multi-stage Dockerfile for Disney & Universal Wait Times Dashboard
# Optimized for Proxmox VE (LXC Docker, Portainer, or standalone Docker engine)

# --- STAGE 1: Builder ---
FROM node:20-alpine AS builder
WORKDIR /app

# Install build dependencies
COPY package.json bun.lock* ./
RUN npm install

# Copy application source code
COPY . .

# Build Vite client assets into /app/dist
RUN npm run build

# --- STAGE 2: Production Runner ---
FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000

# Install production dependencies only (including tsx for running server.ts)
COPY package.json bun.lock* ./
RUN npm install --omit=dev

# Copy built frontend assets and server entry point from builder
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/server.ts ./server.ts
COPY --from=builder /app/package.json ./package.json

# Add curl for healthcheck
RUN apk add --no-cache curl

# Run as non-privileged user for container security
USER node

# Expose primary port 3000 and secondary tunnel port 5000
EXPOSE 3000 5000

# Healthcheck for Proxmox / Docker monitoring
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD curl -f http://localhost:3000/api/health || exit 1

# Start the dashboard server
CMD ["npm", "start"]
