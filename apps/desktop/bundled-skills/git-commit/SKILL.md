---
name: git-commit
description: Create well-structured git commits with conventional commit messages, proper staging, and commit best practices.
command: /git-commit
verified: true
---

# Git Commit Helper

This skill helps create professional, well-structured git commits following best practices.

## Commit Message Format

Use conventional commit format:

```
<type>(<scope>): <description>

[optional body]

[optional footer]
```

### Types

- **feat**: New feature
- **fix**: Bug fix
- **docs**: Documentation changes
- **style**: Code style changes (formatting, etc.)
- **refactor**: Code refactoring
- **test**: Adding or modifying tests
- **chore**: Maintenance tasks

## Workflow

1. Run `git status` to see changes
2. Run `git diff` to review what changed
3. Stage appropriate files (prefer specific files over `git add .`)
4. Create commit with descriptive message
5. Verify commit was successful

## Best Practices

- Keep commits atomic (one logical change per commit)
- Write clear, descriptive commit messages
- Don't commit sensitive files (.env, credentials)
- Review changes before committing

## Examples

- "Commit my changes with a good message"
- "Create a commit for the login feature"
- "Stage and commit the bug fix"
