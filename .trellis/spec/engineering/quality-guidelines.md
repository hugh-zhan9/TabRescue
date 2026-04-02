# Quality Guidelines

> Quality bar for a local-first browser extension with recovery-critical behavior.

---

## Engineering Priorities

In order:

1. correct restore behavior
2. data safety and privacy
3. predictable cross-browser behavior
4. simple code with clear ownership
5. UI polish

---

## Required Patterns

- Small modules with explicit responsibilities:
  - capture
  - model
  - storage
  - restore
  - UI
- Shared types for persisted entities and restore requests
- Thin browser API adapters
- Thin host-communication adapters for Level 2 and Level 3
- Explicit schema versioning for persisted data
- Idempotent or guarded restore triggers
- Explicit handling of configured dedup strategy and storage level

---

## Forbidden Patterns

- Components directly writing snapshot data to storage
- Hidden background retries without logs or state updates
- Large utility files that mix browser APIs, data transforms, and UI concerns
- Persistence contracts defined only implicitly in code
- Adding complex abstractions before there is repeated need

---

## Testing Requirements

Minimum coverage expectations:

- unit tests for storage transforms, validation, retention, and migrations
- unit tests for restore planning and partial-failure behavior
- integration-style tests around browser adapter boundaries where feasible
- integration-style tests around Native Messaging boundaries where feasible
- manual verification on at least Chrome and Firefox for release candidates
- verification of all supported dedup strategies
- verification of Level 1 baseline flow before higher product levels

---

## Review Checklist

- Does the change preserve local-first behavior?
- Does it keep the persisted schema explicit and versioned?
- Are browser-specific differences isolated to adapters?
- Are Level-specific differences isolated to adapters or host bridges?
- Are failures visible, typed, and non-destructive?
- Is the UI showing a summary before destructive or large restore actions?
- Are logs privacy-safe?

---

## Release Checklist

- Save, manual save, and restore flows verified end to end
- Snapshot summary matches actual stored content
- Recovery works without network access
- Existing snapshots still load after schema changes
- No unnecessary permissions added
- Level 1 works without host installation
- Level 2 and Level 3 failure modes degrade cleanly when host setup is missing
- Dedup strategy defaults and switches behave as documented
