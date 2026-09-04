# Skill: Setup-Repo

## Purpose

Configure GitHub Actions read/write workflow permissions automatically for the current repo using GitHub CLI (`gh`).

## Prerequisites

- [GitHub CLI](https://cli.github.com/) (`gh`) installed and authenticated (`gh auth status`).
- Appropriate administrative/write permissions on the target repository.

## Execution

Run the following GitHub API command in the repository root:

```bash
gh api -X PUT /repos/:owner/:repo/actions/permissions/workflow \
  -F default_workflow_permissions=write \
  -F can_approve_pull_request_reviews=true
```

> [!NOTE]
> `gh api` automatically resolves `:owner` and `:repo` based on the git remote of the current working directory.

## Verification

Verify that the workflow permissions have been updated:

```bash
gh api /repos/:owner/:repo/actions/permissions/workflow
```

Expected output:

```json
{
  "default_workflow_permissions": "write",
  "can_approve_pull_request_reviews": true
}
```
