# Contributing to Openwork

Thank you for your interest in contributing to Openwork! This document provides guidelines and instructions for contributing.

## Getting Started

1. Fork the repository
2. Clone your fork: `git clone https://github.com/YOUR_USERNAME/openwork.git`
3. Install dependencies: `pnpm install`
4. Create a branch: `git checkout -b feature/your-feature-name`

## Development

```bash
pnpm dev          # Run the desktop app in development mode
pnpm build        # Build all workspaces
pnpm typecheck    # Run TypeScript checks
pnpm lint         # Run linting
```

## Code Style

- TypeScript for all application code
- Follow existing patterns in the codebase
- Use meaningful variable and function names
- Keep functions focused and small

## Contributing Translations

When adding UI text:
1. Add English to `apps/desktop/locales/en/*.json`
2. Use `t('key')` in components
3. Run `pnpm i18n:sync` to auto-translate
4. Commit all translation files together

See [Translation Guide](scripts/README-i18n.md) for details.

**Native speakers welcome!** Help improve translations by [opening an issue](https://github.com/accomplish-ai/openwork/issues/new) with suggestions, or edit `locales/{language-code}/*.json` files directly.

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
