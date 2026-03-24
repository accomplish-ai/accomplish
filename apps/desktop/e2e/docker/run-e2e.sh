#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../../../.." && pwd)"
DOCKERFILE="$SCRIPT_DIR/Dockerfile"
LOCKFILE="$REPO_ROOT/pnpm-lock.yaml"

# Compute cache key from all files COPYed into the image at build time
# Must match the inputs used for hashFiles() in CI (ci.yml)
CACHE_INPUT=$(
  {
    cat \
      "$DOCKERFILE" \
      "$LOCKFILE" \
      "$REPO_ROOT/pnpm-workspace.yaml" \
      "$REPO_ROOT/package.json" \
      "$REPO_ROOT/packages/agent-core/package.json" \
      "$REPO_ROOT/apps/desktop/package.json" \
      "$REPO_ROOT/apps/web/package.json" \
      "$REPO_ROOT/apps/daemon/package.json"
    find \
      "$REPO_ROOT/scripts" \
      "$REPO_ROOT/apps/desktop/scripts" \
      "$REPO_ROOT/packages/agent-core/mcp-tools" \
      -type f -print0 | sort -z | xargs -0 cat
  } | sha256sum | cut -c1-12
)
IMAGE_NAME="accomplish-e2e:${CACHE_INPUT}"

# Support --print-tag flag: print the image tag this script would use and exit
if [ "$1" = "--print-tag" ]; then
  echo "$IMAGE_NAME"
  exit 0
fi

# Build image only if it doesn't exist locally
if ! docker image inspect "${IMAGE_NAME}" >/dev/null 2>&1; then
  echo "Building E2E base image (tag: ${IMAGE_NAME})..."
  docker build -t "${IMAGE_NAME}" -f "$DOCKERFILE" "$REPO_ROOT"
else
  echo "Using cached E2E base image (tag: ${IMAGE_NAME})"
fi

# Support --build-only flag
if [ "$1" = "--build-only" ]; then
  echo "Image built successfully. Exiting (--build-only)."
  exit 0
fi

# Run the container (detached so we can extract results after it exits)
CONTAINER_ID=$(docker run -d \
  -e E2E_SKIP_AUTH=1 \
  -e E2E_MOCK_TASK_EVENTS=1 \
  -e NODE_ENV=test \
  -e DISPLAY=:99 \
  -e DOCKER_ENV=1 \
  --shm-size=2gb \
  --security-opt seccomp=unconfined \
  -v "$REPO_ROOT:/workspace:ro" \
  "${IMAGE_NAME}" \
  bash /workspace/apps/desktop/e2e/docker/entrypoint.sh)

# Stream logs while waiting
docker logs -f "$CONTAINER_ID" &
LOGS_PID=$!

# Wait for container to finish
EXIT_CODE=$(docker wait "$CONTAINER_ID")
kill $LOGS_PID 2>/dev/null || true

# Extract test results from the stopped container (docker cp works on stopped
# containers — their filesystem persists until docker rm is called)
mkdir -p "$REPO_ROOT/apps/desktop/e2e/test-results"
mkdir -p "$REPO_ROOT/apps/desktop/e2e/html-report"
docker cp "$CONTAINER_ID:/app/apps/desktop/e2e/test-results/." "$REPO_ROOT/apps/desktop/e2e/test-results/" 2>/dev/null || true
docker cp "$CONTAINER_ID:/app/apps/desktop/e2e/html-report/." "$REPO_ROOT/apps/desktop/e2e/html-report/" 2>/dev/null || true

# Clean up
docker rm "$CONTAINER_ID" > /dev/null

exit "$EXIT_CODE"
