# Production Dockerfile for Railway deployment
# Multi-stage build for optimal size and security
# Updated: 2025-07-10 15:20 - Removed Nginx, FastAPI only
# Note: Railway may run this build on multiple Metal builders; that can make deploy take 3x longer (~10 min).

# Build argument to force cache invalidation - Railway will pass this
ARG BUILD_DATE=unknown
ARG CACHE_BUST=1

# Stage 1: Frontend Builder
FROM node:18-slim AS frontend-builder
WORKDIR /frontend

# Use build args to invalidate cache
ARG BUILD_DATE
ARG CACHE_BUST
RUN echo "Build date: ${BUILD_DATE}, Cache bust: ${CACHE_BUST}"

# Copy package files for dependency caching
COPY Frontend/package*.json ./
# Install dependencies (production=false to include devDependencies needed for build)
RUN npm ci --legacy-peer-deps --no-audit --no-fund --production=false

# Copy frontend source - this layer will be invalidated when files change
COPY Frontend/ ./

# Build frontend with optimizations (clean npm cache after build)
RUN npm run build && \
    npm cache clean --force && \
    rm -rf node_modules && \
    rm -rf .vite

# Stage 2: Production Server
FROM python:3.11-slim

# Install system dependencies (minimal set)
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    libmagic1 \
    && rm -rf /var/lib/apt/lists/* \
    && apt-get clean \
    && apt-get purge -y --auto-remove \
    && rm -rf /tmp/* /var/tmp/*

WORKDIR /app

# Install Python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy backend application
COPY app/ ./app/

# Copy built frontend to static directory
COPY --from=frontend-builder /frontend/dist ./static

# Explicitly ensure critical static files are copied fresh (no cache)
# Vite should copy public files to dist root, but we explicitly copy from public as well
# to ensure they're always present (overwrites if already in dist)
COPY --from=frontend-builder /frontend/public/elior.png ./static/elior.png
COPY --from=frontend-builder /frontend/public/favicon.png ./static/favicon.png
COPY --from=frontend-builder /frontend/public/ecshapelogo.svg ./static/ecshapelogo.svg
COPY --from=frontend-builder /frontend/public/logonavbar.png ./static/logonavbar.png

# Verify critical files exist and show their sizes
RUN echo "=== Verifying static files ===" && \
    ls -lh ./static/elior.png && \
    ls -lh ./static/favicon.png && \
    ls -lh ./static/ecshapelogo.svg 2>/dev/null || echo "ecshapelogo.svg not found (may be in assets)" && \
    ls -lh ./static/logonavbar.png 2>/dev/null || echo "logonavbar.png not found" && \
    echo "=== Static files verified ==="

# Copy admin setup script only
COPY setup_admin.py ./setup_admin.py

# Set proper permissions
RUN chmod -R 755 ./static && \
    mkdir -p uploads data logs && \
    chmod 755 uploads data logs \
    && mkdir -p /data && chmod 777 /data \
    && mkdir -p /app/persistent/data /app/persistent/uploads /app/persistent/logs && \
    chmod -R 755 /app/persistent

# Create startup script
RUN echo '#!/bin/bash\n\
set -e\n\
echo "=== ELIOR FITNESS STARTUP ==="\n\
echo "Time: $(date)"\n\
echo "Environment: $ENVIRONMENT"\n\
echo "Port: $PORT"\n\
echo "Checking static files..."\n\
ls -la ./static/ || echo "Static directory not found"\n\
echo "Setting up admin user..."\n\
python /app/setup_admin.py\n\
echo "Starting FastAPI on port ${PORT:-8000}..."\n\
exec uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000} --workers 1 --limit-concurrency 50 --timeout-keep-alive 30\n\
' > /app/start.sh && chmod +x /app/start.sh

# Expose port - Railway will provide PORT env var dynamically
# Using 8000 as default for local development, but Railway will override
EXPOSE 8000

# Health check - uses PORT env var (Railway provides this)
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:${PORT:-8000}/health || exit 1

# Start application
CMD ["/app/start.sh"] 