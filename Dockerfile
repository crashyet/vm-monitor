# Stage 1: Build Frontend
FROM node:24-alpine AS client-builder
WORKDIR /app/client
COPY client/package*.json ./
RUN npm ci
COPY client/ ./
RUN npm run build

# Stage 2: Build Backend
FROM node:24-alpine AS server-builder
WORKDIR /app/server
COPY server/package*.json ./
RUN npm ci
COPY server/ ./
RUN npm run build

# Stage 3: Production Runtime
FROM node:24-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3001
ENV DATA_DIR=/app/data

# Create data directory
RUN mkdir -p /app/data

# Copy built backend and dependencies
COPY --from=server-builder /app/server/package*.json ./
RUN npm ci --omit=dev

COPY --from=server-builder /app/server/dist ./dist
# Copy built frontend assets into public directory
COPY --from=client-builder /app/server/public ./public

EXPOSE 3001

VOLUME ["/app/data"]

CMD ["node", "dist/index.js"]
