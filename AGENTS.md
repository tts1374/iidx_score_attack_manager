# AGENTS.md

## 0. Governance

This project is governed by the following documents:

- AGENTS.md (execution constraints)
- WORKFLOW.md (planning and PR rules)
- QUALITY.md (acceptance criteria)

If any conflict occurs, AGENTS.md takes precedence for execution rules.

---

## 1. Execution Policy

Primary objective: satisfy the requested change with the smallest correct diff.

Rules:
- Start from the most directly related file(s) only.
- Do not expand investigation unless local evidence is insufficient.
- Do not stop at inspection-only when the requested change is local and implementable in the same pass.
- Do not perform unrelated cleanup, renames, reorder-only edits, or formatting-only edits.
- Prefer a concrete local fix over broad redesign unless redesign is explicitly requested.

### 1.1 Search Budget
For the first pass:
- inspect at most 3 files or perform at most 3 focused searches
- if still unclear, expand incrementally
- do not begin with repo-wide exploration by default

### 1.2 Default Execution
Unless explicitly requested otherwise, default behavior is:
- local analysis
- local implementation
- local validation
- concise summary of changed files and verification

### 1.3 Prohibited Default Behavior
Unless the task explicitly requires it:
- no broad architecture review
- no speculative best-practice rewrite
- no repo-wide cleanup
- no initial full traversal of PWA / SW / Locks / storage layers

### 1.4 Current Request Boundary
Before acting, classify the current request ceiling as one of:
- analysis-only
- planning-only
- artifact-update-only
- implementation-authorized
- review-fix-only
- merge / close / cleanup authorized

Rules:
- Do not cross the current request boundary unless the user explicitly expands it.
- Requests to create a plan, task artifact, or issue comment do not authorize implementation in the same pass.
- Requests to fix review feedback do not authorize unrelated merge or cleanup.

---

## 2. Planning Gate

Planning requirements are governed by WORKFLOW.md.

Rules:
- If WORKFLOW.md requires Plan Mode, do not implement before the plan is written.
- If WORKFLOW.md does not require Plan Mode, do not create a plan file by default.
- Do not escalate a local change into Plan Mode unless there is clear evidence that one of the gate conditions applies.

### 2.1 Lightweight Pre-Execution Note
For non-Plan tasks, keep pre-execution notes minimal:
- target
- intended files
- validation method

Do not produce long planning text for local tasks.

### 2.2 Sticky Session Constraints
- User clarifications, repeated corrections, explicit non-goals, and narrowed scope inside the same thread are treated as sticky hard constraints.
- Carry those constraints forward into later analysis, implementation, validation, PR, close, and cleanup steps until the user explicitly changes them.
- If a later request is broader but ambiguous, keep the narrower earlier constraint.

### 2.3 Human Decision Requests
- If human input is required, return `WAITING_FOR_HUMAN_DECISION` or equivalent together with 2-3 concrete options.
- Include one recommended option and the consequence of each option.
- Do not stop with an abstract blocker when a bounded decision can unblock the task.

---

## 3. Core Invariants

### 3.1 Single-tab operation (frozen)
Current product invariant: single-tab operation via Web Locks.

- Lock name `iidx-score-attack-web-lock` must not be changed without dedicated design/implementation review.
- Lock acquisition flow must not be changed in a mixed-purpose PR.
- BroadcastChannel / storage-event delegation path must not be changed in a local fix PR.
- Multi-tab support must be handled only in a dedicated PR/PR series.

### 3.2 PWA / COI / Startup
The following are treated as high-risk:
- Service Worker behavior
- COOP / COEP / crossOriginIsolated behavior
- startup sequence
- import entry routing
- evidence persistence lifecycle

Local fixes must avoid touching these areas unless the task explicitly targets them.

### 3.3 Persistence compatibility
The following are treated as high-risk:
- SQLite WASM / OPFS persistence behavior
- import/export format
- `def_hash`
- DB schema / `user_version`
- song master validation / update flow

---

## 4. Work Isolation

### 4.1 worktree
- Use git worktree for implementation tasks and PR-sized changes.
- 1 worktree = 1 branch = 1 purpose.

### 4.2 Base SHA
- For PR work and high-risk work, record BASE_SHA at the start.
- Avoid mid-task rebase/merge unless required for review or conflict resolution.

Note:
- worktree path declaration and BASE_SHA declaration are execution controls for implementation work.
- They must not block lightweight review, drafting, inspection, or small local analysis tasks.

---

## 5. Diff Discipline

- Keep the diff limited to files required for the task.
- If the affected files are obvious and local, start implementation without broad pre-declaration.
- If the task is risky or cross-cutting, declare intended scope before editing.
- No unrelated formatting, reordering, rename, or generated-file edits.
- Do not edit build artifacts directly (`dist`, `build`, generated outputs).

### 5.1 Scope Escalation
If additional files become necessary:
- expand only to the minimum additional scope
- state why the expansion is necessary
- keep unrelated changes out

---

## 6. Risk Levels

### 6.1 Normal-risk changes
Examples:
- text/i18n fixes
- local UI fixes
- local validation changes
- small logic fixes inside existing responsibility boundaries
- tests for existing behavior

Default behavior:
- no plan file unless WORKFLOW.md requires it
- start from local files
- validate locally
- summarize briefly

### 6.2 High-risk changes
Examples:
- Service Worker / COOP-COEP / startup sequence
- Web Locks / single-tab invariant
- import/export / share / save / launch flow
- DB schema / compatibility / migration
- payload or contract changes
- CI/CD / release / deploy changes
- dependency updates
- song master update/validation flow
- changes spanning `packages/web-app`, `packages/shared`, `packages/db`, `packages/pwa`

Required behavior:
- follow WORKFLOW Plan Mode if applicable
- explicitly list affected layers
- verify against QUALITY.md high-risk checks

---

## 7. Git Constraints

- no direct push to protected mainline branch
- 1 branch = 1 purpose
- unless the user explicitly instructs otherwise, create/reopen PRs from GitHub account `tts1374-bot`
- do not edit CI-generated outputs manually
- do not mix machine-generated diffs with manual logic edits in the same commit unless explicitly intended and isolated

### 7.1 PR Author Account
- Before `gh pr create` or equivalent PR creation, confirm the active GitHub account is `tts1374-bot`.
- If a PR was created from another account and that author choice would block the intended approval flow, close/reopen it from `tts1374-bot` before proceeding to approval or merge.

### 7.2 Write-back Requires Read-back
- Issue comments, PR updates, merge, Issue close, branch cleanup, and similar external state changes are not complete until read-back confirms the resulting state.
- Command success, empty stdout, or optimistic assumptions are insufficient.
- If read-back cannot confirm the result, report the task as partial or blocked.

---

## 8. File I/O Rules

### 8.1 Canonical Rules
- Text files must be UTF-8 without BOM.
- Line endings are LF unless a file is explicitly documented otherwise.
- UTF-16 prohibited.
- CP932 / Shift_JIS prohibited.

### 8.2 Practical Rule
- Apply strict encoding care to files being modified.
- Do not perform repository-wide encoding checks before local implementation.
- If mojibake or abnormal full-file diff appears, treat it as an encoding defect and fix the source of corruption.

### 8.3 Write Rule
- Always write with explicit UTF-8 (no BOM).
- Prefer atomic replace when using tools/scripts that support it.
- Verify after write that `git diff` shows no unintended encoding or line-ending noise.

### 8.4 Tooling Caution
- Do not trust PowerShell default encoding.
- `Set-Content` / `Out-File` require explicit UTF-8 handling.
- Node / Python must specify encoding explicitly.

### 8.5 Prohibited
- UTF-16 output
- BOM付きUTF-8 output
- unintended CRLF/LF drift
- implicit encoding conversion by editor/tool defaults

---

## 9. Local-Dependency Prohibition

- no absolute paths
- no embedded environment-specific values
- do not edit `.env` directly unless the task explicitly requires environment configuration work

---

## 10. Repository Context

Workspace:
- `packages/web-app`
- `packages/shared`
- `packages/db`
- `packages/pwa`

Project characteristics:
- React + TypeScript
- SQLite WASM + OPFS persistence
- PWA (Service Worker)
- Web Locks single-tab exclusion

Implication:
- UI-only tasks should stay UI-local.
- Do not open DB/PWA/shared layers unless the change clearly requires them.
