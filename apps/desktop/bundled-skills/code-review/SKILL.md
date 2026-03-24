---
name: code-review
description: Review code for bugs, security issues, performance problems, and best practices. Provide actionable feedback.
command: /code-review
verified: true
---

# Code Review

This skill provides thorough code review with actionable feedback.

## Review Checklist

### Correctness

- Logic errors
- Edge cases not handled
- Incorrect assumptions

### Security

- Input validation
- SQL injection
- XSS vulnerabilities
- Hardcoded secrets

### Performance

- Unnecessary loops
- N+1 queries
- Memory leaks
- Inefficient algorithms

### Maintainability

- Code clarity
- Naming conventions
- Function length
- Documentation

### Best Practices

- DRY (Don't Repeat Yourself)
- SOLID principles
- Error handling
- Testing coverage

## Output Format

For each issue found:

1. **Location**: File and line number
2. **Severity**: Critical / Warning / Suggestion
3. **Issue**: What the problem is
4. **Fix**: How to resolve it

## Examples

- "Review this function for security issues"
- "Check my PR for bugs"
- "Review the authentication code"
