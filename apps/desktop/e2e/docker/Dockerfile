# Base image with Playwright dependencies pre-installed
FROM mcr.microsoft.com/playwright:v1.49.1-noble

# Install Xvfb, build tools (for node-pty), and additional dependencies for Electron
RUN apt-get update && apt-get install -y \
    xvfb \
    build-essential \
    python3 \
    libnss3 \
    libatk1.0-0 \
    libatk-bridge2.0-0 \
    libcups2 \
    libdrm2 \
    libxkbcommon0 \
    libxcomposite1 \
    libxdamage1 \
    libxfixes3 \
    libxrandr2 \
    libgbm1 \
    libasound2t64 \
    libpango-1.0-0 \
    libcairo2 \
    && rm -rf /var/lib/apt/lists/*

# Install pnpm
RUN corepack enable && corepack prepare pnpm@9.15.0 --activate

WORKDIR /app

# Copy package files needed for pnpm install (cached in image layer)
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/agent-core/package.json ./packages/agent-core/
COPY apps/web/package.json ./apps/web/
COPY apps/desktop/package.json ./apps/desktop/
COPY apps/daemon/package.json ./apps/daemon/

# Copy scripts directory (needed by root postinstall script)
COPY scripts/ ./scripts/
COPY packages/agent-core/mcp-tools ./packages/agent-core/mcp-tools
COPY apps/desktop/scripts ./apps/desktop/scripts

# Install dependencies (cached unless package files change)
RUN pnpm install --frozen-lockfile

ENV DISPLAY=:99
