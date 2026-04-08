---
name: pr
description: Create, update, and finalize GitHub pull requests for issue-backed work. Use when Codex needs to open a draft PR, refresh the PR title or body from the repository template, record validation results, process a new review cycle on an existing PR, or convert a draft PR to ready for review.
---

# /pr — Pull Request Workflow

## Overview

Use this skill for PR-only work after commits exist locally or on the branch. Keep branch creation, committing, and pushing in their own skills. Use this skill to manage the PR itself: create it, update it, keep the body aligned with the template, and convert it from draft to ready for review.

## Prerequisites

- Require `gh` CLI authentication before using CLI fallback paths.
- Prefer the GitHub app or connector flow for PR creation and metadata reads when repository and branch context are already known.
- Use the repository template at `.github/pull_request_template.md` for every PR body.

## Scope

This skill owns all of the following:

- Create a draft PR for a branch that does not already have one
- Update the PR title and body when the implementation scope or validation results change
- Refresh the PR body at the start of a new review-feedback cycle
- Convert a draft PR to ready for review when the active cycle is complete
- Keep issue references and validation output consistent in the PR body

This skill does not own:

- Creating commits
- Pushing the branch
- Merging the PR after approval

## Title Rules

- Use a conventional-commit-like subject for the PR title when possible.
- Append `(#<issue-number>)` to the title when the PR is tied to an issue-backed task.
- Keep the title aligned with the dominant user-visible change, not the last commit message.

Examples:

```text
feat(bundle-viewer): add image preview fallback (#42)
fix(auth): bypass login in development (#108)
```

## Body Template

Always start from `.github/pull_request_template.md`.

Fill every section with concrete project-specific content:

- `Summary`: what changed in this cycle
- `Why`: why the change was needed
- `Changes`: concise list of implementation points
- `Validation`: exact commands run and their outcomes
- `Risks`: follow-up risk, rollout concern, or `None`
- `Issue`: `Refs #<issue-number>` for normal linkage
- `Review Feedback Addressed`: include only when updating an existing PR for a feedback cycle

Apply issue linkage strictly:

- Always include exactly one issue-link line in the `Issue` section.
- Use `Refs #<issue-number>` while the PR is draft, while implementation is still in progress, and during review-feedback cycles.
- Replace `Refs #<issue-number>` with `Closes #<issue-number>` only when the PR is being promoted to ready for review and merge of that PR is intended to resolve the issue completely.
- Never include both `Refs` and `Closes` for the same issue in the same PR body.
- If the PR only covers a partial slice or follow-up work that should not close the issue on merge, keep `Refs #<issue-number>` even when the PR is ready for review.

## Workflow

### 1. Resolve PR context

1. Determine the repository, base branch, head branch, and issue number.
2. Check whether a PR already exists for the current branch.
3. If a PR exists, fetch its current title, body, state, and URL before editing.

### 2. Create or update the draft PR

When no PR exists:

1. Confirm the branch has been pushed.
2. Create a draft PR.
3. Use the repository template to write the initial body.
4. Record the PR URL in the workpad or status comment flow that invoked this skill.
5. In the `Issue` section, use `Refs #<issue-number>` for the initial draft.

When a PR already exists:

1. Preserve still-accurate content.
2. Refresh outdated sections from the current implementation state.
3. Add or replace the `Review Feedback Addressed` section when this is a rework cycle.
4. Keep exactly one issue-link line in the `Issue` section and choose `Refs` or `Closes` according to the strict policy above.

### 3. Keep validation current

Update the `Validation` section whenever new checks are run.

Prefer this format:

```md
## Validation

- [x] `npm test`
- [x] `npm run build`
```

If a check fails or is intentionally skipped, say so explicitly instead of implying success.

### 4. Promote to ready for review

Before converting a draft PR to ready for review:

1. Ensure the branch is pushed.
2. Ensure the PR body reflects the current cycle's actual changes.
3. Ensure the validation section is current.
4. Ensure the title still matches the scope.
5. If merge of this PR should close the issue, replace `Refs #<issue-number>` with `Closes #<issue-number>` immediately before promotion.
6. Otherwise keep `Refs #<issue-number>`.
7. Convert the PR to ready for review.

## Update Rules For Review Cycles

When the issue returns to `Ready` and a PR already exists:

1. Read top-level PR comments.
2. Read inline review comments and unresolved review threads.
3. Summarize the addressed feedback in `Review Feedback Addressed`.
4. Update `Summary`, `Changes`, and `Validation` for the new cycle.
5. Keep the existing PR open; do not create a replacement PR unless the branch strategy changed intentionally.

## CLI Fallback

Use `gh` CLI if connector-based PR creation or editing is not sufficient.

Typical commands:

```bash
gh pr create --draft --base <base> --head <branch> --title "<title>" --body-file .github/pull_request_template.md
gh pr edit <number> --title "<title>" --body-file /tmp/pr-body.md
gh pr ready <number>
```

When using CLI fallback, write the rendered PR body to a temporary file with real newlines before calling `gh pr create` or `gh pr edit`.

## Rules

- Always create new PRs as draft first unless the user explicitly asks otherwise.
- Always use the repository PR template as the starting point.
- Never leave placeholder template text in an opened or updated PR.
- Never claim validation passed unless the commands were actually run.
- Always keep exactly one issue-link line in the `Issue` section.
- Never use both `Refs` and `Closes` for the same issue in one PR body.
- Default to `Refs #<issue-number>`; switch to `Closes #<issue-number>` only when merge is intended to fully resolve the issue.
- Never open a second PR for the same branch just to represent a new review cycle.
- Never convert a PR to ready for review while required validation is stale or missing.
