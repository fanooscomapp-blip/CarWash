# ---- Stage 1: build the React admin portal ----
FROM node:22-alpine AS client-build
WORKDIR /app/client
COPY client/package*.json ./
RUN npm ci
COPY client/ ./
RUN npm run build

# ---- Stage 2: API server + static client ----
FROM node:22-alpine
ENV NODE_ENV=production
WORKDIR /app/server
COPY server/package*.json ./
RUN npm ci --omit=dev
COPY server/ ./
COPY --from=client-build /app/client/dist ./public
RUN mkdir -p /app/server/uploads /data
# Runs as root so mounted volumes (Railway /data) are writable; the app itself only touches UPLOADS_DIR.
EXPOSE 4000
HEALTHCHECK --interval=30s --timeout=5s --retries=3 CMD wget -qO- http://localhost:4000/api/health || exit 1
CMD ["node", "src/index.js"]
