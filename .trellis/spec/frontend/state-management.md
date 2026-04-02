# State Management

> Keep UI state simple. Persisted recovery state belongs to storage modules, not ad hoc frontend caches.

---

## State Categories

- Local UI state:
  - expanded panels
  - confirmation dialog visibility
  - temporary form values
- Shared UI state:
  - latest snapshot summary
  - snapshot history list
  - expanded snapshot detail ids
  - snapshot detail payloads by snapshot id
  - grouped window preview for the selected snapshot
  - restore progress
  - settings loaded for display
  - active storage level and host availability
  - active dedup strategy
- Persisted domain state:
  - current session
  - snapshots
  - saved settings

---

## Default Rule

Start with local component state or a focused hook.
Only introduce wider shared state when multiple UI surfaces truly need the same live data.

---

## Persistence Rule

- The source of truth for recovery data is extension storage.
- `currentSession` is the live source of truth for background capture; archived `snapshots` are the user-facing recovery source in popup UI.
- UI state can mirror persisted data, but must not redefine the persisted contract.
- Derived summaries should be computed from stored data or dedicated selectors, not hand-maintained in multiple places.
- `storage.level` and `dedup.strategy` are product settings, not ad hoc component toggles.

---

## Global State Guidance

- Do not introduce a heavy client-state library unless the popup and options surfaces become meaningfully complex.
- For first versions, shared hooks over storage-backed selectors are preferred over app-wide global stores.
- Keep Level 1/2/3 differences behind view-model hooks so components render product state, not transport details.

---

## Forbidden Patterns

- Treating background runtime state as React-only state
- Keeping duplicate snapshot lists in multiple components
- Updating stored session data through unrelated UI effects
- Recomputing restore confirmation thresholds differently in multiple UI components
- Components inferring host availability by probing transport APIs directly

---

## Current Project References

Until implementation code exists, treat the design doc as the canonical example source:

- `docs/superpowers/specs/2026-04-02-browser-session-recovery-design.md`
  - sections 5.2 and 5.3: product levels and storage-level selection
  - sections 6.2 and 6.9: `currentSession` as live state and `snapshots` as archive state
  - section 6.5: settings and history data exposed to UI
  - section 6.7: restore progress and confirmation-tier state needs
