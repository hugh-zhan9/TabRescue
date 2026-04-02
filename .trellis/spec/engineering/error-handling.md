# Error Handling

> Failure handling rules for the browser session recovery extension.

---

## Principles

- Fail small. A single tab or snapshot failure must not take down the whole restore flow.
- Fail explicitly. Return stable error codes or typed results at module boundaries.
- Fail locally. Catch errors at browser API, storage, and migration boundaries instead of letting raw platform errors leak upward.
- Fail visibly when the user can act on it. Silent failure is acceptable only for best-effort background work with a later retry path.

---

## Error Categories

Use a small, stable set of domain-oriented error categories:

- `permission_denied`
- `storage_unavailable`
- `storage_corrupted`
- `schema_mismatch`
- `snapshot_not_found`
- `restore_partial_failure`
- `unsupported_browser_capability`
- `unknown_error`

These codes should be more stable than raw browser error messages.

---

## Boundary Rules

### Browser API Boundary

- Wrap `tabs.*`, `windows.*`, `storage.*`, and runtime APIs in thin modules.
- Convert browser-specific exceptions into project error codes.
- Do not let React components call raw browser APIs directly.

### Storage Boundary

- Validate persisted data before use.
- Treat missing optional data as recoverable.
- Treat malformed persisted data as `storage_corrupted` or `schema_mismatch`.
- When possible, recover by discarding only the bad snapshot instead of resetting the whole store.

### Restore Boundary

- Restore operations must continue after a per-tab failure.
- Record partial failures and surface a concise summary to the user.
- Repeated restore clicks must not fan out into duplicate windows without an explicit second action.
- Disable the restore action while a restore is in flight.
- Re-restoring the same snapshot within a short window should require explicit user confirmation.

---

## User-Facing Behavior

- Background autosave failures should be visible but non-blocking.
- Manual save failures should show a clear error state and retry affordance.
- Restore UI should tell the user whether the result was:
  - fully restored
  - partially restored
  - not restored
- Error copy should describe the action that failed, not just the exception text.
- Single-tab restore failures should surface as compact inline feedback.
- When most tabs fail, escalate to a snapshot-level warning instead of many noisy row-level messages.

---

## Patterns to Follow

- Prefer `Result`-style returns or explicit discriminated unions for recoverable operations.
- Throw only when the caller boundary is explicitly designed to catch and translate the error.
- Normalize unknown exceptions with a shared helper before logging or rendering.
- Restore flows should return structured counts such as requested tabs, opened tabs, failed tabs, and final status.

---

## Forbidden Patterns

- Catch and ignore without logging or state update.
- Returning raw `Error` objects from public module APIs.
- Showing raw browser exception text directly in UI.
- Mixing retry logic into presentation components.

---

## Required Test Cases

- Corrupted snapshot is skipped without deleting valid snapshots.
- One tab fails to restore while the remaining tabs still open.
- Storage write failure produces user-visible feedback for manual save.
- Unsupported browser capability degrades cleanly instead of crashing startup.
- Repeated restore click while a restore is active does not create duplicate restore work.

---

## Current Project References

Until implementation code exists, treat the design doc as the canonical example source:

- `docs/2026-04-02-browser-session-recovery-design.md`
  - section 6.7: restore confirmation tiers and repeat-restore guard
  - section 6.11: inline failure feedback and snapshot-level warning rules
  - section 8: stability requirements for partial restore and non-destructive failure handling
