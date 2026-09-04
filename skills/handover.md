---
name: handover
description: Compact the current session into a high-fidelity handover document and bootstrap prompt for another agent to seamlessly resume work.
argument-hint: "What will the next session be used for?"
---

# Skill: Handover

> Adapted from Matt Pocock's Session Handover & Context Snapshot workflow.

## Purpose

Capture an accurate, lightweight context snapshot at the boundary of a chat session so a fresh AI agent can resume work immediately without paying a "re-discovery tax" or carrying conversational bloat.

## When to Use

- When switching AI agents, models, or harnesses (e.g. Claude Code, Cursor, Antigravity).
- When a chat session approaches context limits or begins degrading in performance.
- When branching or forking a parallel task to another session.
- When passing work to a teammate.

## Handover Generation Workflow

When invoked, generate a handover document containing the following sections:

### 1. Document Structure

```markdown
# Session Handover: <Topic / Feature Name>
**Date**: <YYYY-MM-DD>
**Next Session Goal**: <Target objective passed by user or deduced from context>

---

## 1. Executive Status & Progress
- **Current State**: What is working, what was completed this session.
- **In Flight**: Exact tasks or files actively being modified.
- **Immediate Next Step**: The very first concrete action the next agent should take.

## 2. Key Decisions & Rationale
- Bullet points explaining *why* decisions were made, not just *what* was done.
- Unsettled questions or rejected alternatives.

## 3. Artifact References
> Reference by path or URL—do NOT duplicate full file contents.
- **Specs / Plans**: e.g. `openspec/specs/...`
- **Source Code**: e.g. `src/...`
- **Related Issues / PRs**: Links or issue numbers

## 4. Suggested Skills & Tools
- List skills or slash commands the next agent should invoke (e.g. `grill-me`, `setup-repo`).

## 5. Bootstrap Prompt
```markdown
[Paste this into the fresh session]
Resume work on <Feature/Topic>. Read the handover document at `<path>` and proceed with <Immediate Next Step>.
\```
```

## Rules & Best Practices

1. **Reference, Never Duplicate**:
   - Do not copy full spec contents, diffs, or code blocks into the handover document. Reference them by file path or issue number so information remains single-sourced.
2. **Redact Sensitive Data**:
   - Ensure all tokens, private keys, API secrets, and sensitive credentials are completely redacted.
3. **Capture the *Why*, Not Just the *What***:
   - State reasoning, architectural constraints, and discarded alternatives so the incoming agent doesn't undo deliberate choices.
4. **Target the Handoff**:
   - If the user provides an argument (e.g. `/handover "Write unit tests for the API"`), tailor the document and bootstrap prompt directly to that objective.
5. **Storage Location**:
   - Save the handover artifact either to a project documentation directory (e.g., `docs/handovers/HANDOVER_<YYYY-MM-DD>.md`) or display it directly with instructions to save if running in a temporary context.
