---
name: commit
description: Create clean, logically scoped commits that keep the repository in a shippable state.
license: MIT
metadata:
  author: gh-symphony
  version: "1.0"
  generatedBy: "gh-symphony"
---

# /commit — Clean Commit Workflow

## Trigger

Use this skill when creating commits during implementation.

## Rules

- Commit in logical units — one concern per commit
- Never commit a broken intermediate state (tests must pass)
- Never commit temporary debug code or commented-out blocks
- Run tests before every commit
- When the work is tied to a GitHub issue, append `(#<issue-number>)` to the end of the commit subject so GitHub can relate the commit to the issue

## Format

Use Conventional Commit format:

```
<type>(<scope>): <description> (#<issue-number>)

[optional body — explain WHY, not WHAT, 72 chars/line]

[optional footer: Closes #N]
```

**Types**: `feat`, `fix`, `refactor`, `test`, `docs`, `chore`

**Description**: imperative mood, 50 chars max, no period at end

**Issue suffix**:
- Use `(#<issue-number>)` at the end of the first line when the commit belongs to an issue-backed task
- Omit the suffix only when there is no authoritative issue number in context
- Keep `Closes #N` or other footers for issue-closing intent; the suffix is for commit-to-issue relation and does not replace explicit closing footers

## Examples

```
feat(auth): add OAuth2 token refresh (#42)
fix(api): handle null response from upstream (#108)
test(worker): add retry exhaustion coverage (#256)
```
