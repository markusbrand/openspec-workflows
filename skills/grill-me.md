---
name: grill-me
description: Relentless interview to stress-test and sharpen an OpenSpec, architecture, or plan before implementation.
---

# Skill: Grill-Me

> Adapted from Matt Pocock's Spec-Grill & Architecture Check workflow.

## Purpose

Interview the user relentlessly until you achieve a rock-solid, shared understanding of a specification, architectural change, or feature plan. Prevent superficial planning, hidden assumptions, and "vibe coding" before any implementation starts.

## Mental Model: Design Tree & Frontier

1. **The Design Tree**: Every project decision branches into downstream decisions that depend on it.
2. **The Frontier**: The set of open decisions whose prerequisites are already settled. These are the only questions you can ask *now* without guessing answers to questions you haven't asked yet.
3. **Rounds**: Ask the entire frontier together in numbered rounds. Each user response settles branches and unlocks a new frontier for the next round.

## Question Round Format

Present each round cleanly using this format:

```markdown
❓ **Q1** - **<Question Title>**: <Context, explanation of trade-offs, and choices (A/B/C)>

➡️ **Recommendation**: <Your recommended answer and rationale>

---

❓ **Q2** - **<Question Title>**: <Context, explanation of trade-offs, and choices (A/B/C)>

➡️ **Recommendation**: <Your recommended answer and rationale>
```

## Rules of Engagement

1. **Facts are Your Job, Decisions are the User's**:
   - Never ask the user for facts you can discover by inspecting the codebase, configuration, or documentation yourself.
   - Investigate the workspace first; only bring genuine architectural and product decisions to the user.
2. **Recommend, Don't Abdicate**:
   - Always provide a concrete recommendation for every question on the frontier.
3. **Keep Order Strict**:
   - If Question B depends on the answer to Question A, Question B belongs in a *future* round, never the current one.
4. **Spot Ungrillable Questions**:
   - If a question cannot be answered theoretically (e.g. UX feel, subjective latency), identify it as *ungrillable* and suggest a quick spike or prototype rather than speculating.
5. **Completion Condition**:
   - The session ends when the frontier is empty: every branch has been traversed and no silent assumptions remain.
   - Wait for explicit user confirmation that shared understanding is achieved before proceeding to specs or code.
