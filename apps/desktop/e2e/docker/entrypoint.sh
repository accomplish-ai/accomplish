#!/bin/bash
set -e

# Copy source from mounted workspace into /app (where node_modules already exists from image build)
# Exclude node_modules to avoid overwriting the pre-installed deps from the image
echo "Copying source into container..."
tar -C /workspace \
  --exclude=node_modules \
  --exclude=.git \
  -cf - . | tar -C /app -x

cd /app

# Build all packages (deps already installed in image)
echo "Building..."
pnpm build

# Start Xvfb
Xvfb :99 -screen 0 1920x1080x24 &
sleep 1

# Run E2E tests
echo "Running E2E tests..."
pnpm -F @accomplish/desktop test:e2e:native
