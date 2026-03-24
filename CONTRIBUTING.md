# Contributing to Accomplish

Thank you for your interest in contributing to Accomplish! This document provides guidelines and instructions for contributing.

## Getting Started

1. Fork the repository
2. Clone your fork: `git clone https://github.com/YOUR_USERNAME/accomplish.git`
3. Install dependencies: `pnpm install`
4. Create a branch: `git checkout -b feature/your-feature-name`

## Development

```bash
pnpm dev          # Run the desktop app in development mode
pnpm build        # Build all workspaces
pnpm typecheck    # Run TypeScript checks
pnpm lint         # Run linting
```

## Testing

Before opening a pull request, ensure your changes don't break existing functionality by running the appropriate tests:

### Web UI (apps/web)

```bash
pnpm -F @accomplish/web test                    # Run all web tests
pnpm -F @accomplish/web test:unit               # Unit tests only
pnpm -F @accomplish/web test:integration        # Integration tests only
```

### Desktop App (apps/desktop)

```bash
pnpm -F @accomplish/desktop test                # Run all desktop tests
pnpm -F @accomplish/desktop test:unit           # Unit tests only
pnpm -F @accomplish/desktop test:integration    # Integration tests only
pnpm -F @accomplish/desktop test:e2e            # Docker-based E2E tests
```

### Core Logic (packages/agent-core)

```bash
pnpm -F @accomplish_ai/agent-core test          # Run core tests
```

## Code Style

- TypeScript for all application code
- Follow existing patterns in the codebase
- Use meaningful variable and function names
- Keep functions focused and small

## Pull Request Process

1. Ensure your code builds without errors (`pnpm build`)
2. Run type checking (`pnpm typecheck`)
3. Update documentation if needed
4. Write a clear PR description explaining:
   - What the change does
   - Why it's needed
   - How to test it

## Commit Messages

Use clear, descriptive commit messages:

- `feat: add dark mode support`
- `fix: resolve crash on startup`
- `docs: update README with new instructions`
- `refactor: simplify task queue logic`

## Reporting Issues

When reporting issues, please include:

- OS and version
- Steps to reproduce
- Expected vs actual behavior
- Any error messages or logs

## Security

If you discover a security vulnerability, please see [SECURITY.md](SECURITY.md) for responsible disclosure guidelines.

## License

By contributing, you agree that your contributions will be licensed under the MIT License.
