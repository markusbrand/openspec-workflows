# OpenSpec Workflows

Central reusable GitHub Actions and tooling for hierarchical OpenSpec-to-GitHub-Issues synchronization.

## Features

- **Hierarchical Two-Tier Synchronization**: Automatically models major initiatives as **Epics** (`type: epic`) and granular features as **Sub-Specs** (`type: sub-spec`).
- **GitHub Issues Integration**:
  - Automatically creates missing GitHub issues for both Epics and Sub-Specs.
  - Links Sub-Specs directly to Epics using GitHub's native Sub-issues GraphQL API.
  - Generates and synchronizes interactive Sub-spec tasklists in the parent Epic's description.
- **State & Label Synchronization**: Keeps issue states (`open`/`closed`) and labels in sync with OpenSpec YAML frontmatter.
- **Automatic Write-Back**: Commits assigned `issue_number` values back into specification files with `[skip ci]`.
- **Zero Runtime Dependencies**: The synchronization engine runs natively on Node.js without requiring third-party npm packages.

## Quick Start

### 1. Reusable Workflow Usage

In your project repository (e.g. `.github/workflows/openspec-sync.yml`):

```yaml
name: OpenSpec Sync

on:
  push:
    paths:
      - 'openspec/specs/**'
    branches:
      - main
  workflow_dispatch:

jobs:
  sync:
    permissions:
      contents: write
      issues: write
    uses: markusbrand/openspec-workflows/.github/workflows/sync-specs.yml@v1
    secrets:
      GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

### 2. Specification Frontmatter Schema

#### Epic Frontmatter Example:
```yaml
---
id: EPIC-01-CORE
type: epic
title: Core Monorepo and Flight Pipeline Architecture
issue_number: null
status: open
labels:
  - epic
  - openspec
---
```

#### Sub-Spec Frontmatter Example:
```yaml
---
id: SPEC-CONTINUOUS-VALIDATION
type: sub-spec
parent: EPIC-01-CORE
title: Continuous Validation
issue_number: null
status: open
labels:
  - spec
  - openspec
---
```
