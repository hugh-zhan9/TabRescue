# Quality Guidelines

> Frontend quality standards for a reliability-focused extension UI.

---

## Required Patterns

- Primary user path is obvious: see latest snapshot, review summary, restore.
- UI labels match stored or computed reality.
- Async actions expose loading and failure states.
- Components stay small and presentation-focused.
- Hooks return explicit states rather than nullable bags of fields.
- Restore confirmation follows the snapshot-size tiers defined in the product spec.
- Snapshot detail views reflect window grouping, not a flat unordered tab list.

---

## Forbidden Patterns

- Fancy UI that obscures restore clarity
- Components that read and write storage directly
- Unbounded polling for data that can be event-driven or storage-driven
- Swallowing errors in UI actions

---

## Testing Requirements

- Unit tests for snapshot summary formatting and UI state derivation
- Component tests for restore confirmation, empty states, and failure states
- Manual testing in popup-sized layouts
- Keyboard accessibility check for critical actions
- Tests for the passive startup UX: badge state or recoverable marker without forced popup by default

---

## Review Checklist

- Is the latest snapshot summary accurate?
- Is the restore action still understandable in a narrow popup?
- Are error and partial-success states visible without opening DevTools?
- Does the UI avoid pretending that all tabs restored when some failed?
- Does the UI apply the same restore confirmation thresholds everywhere?

---

## Current Project References

Until implementation code exists, treat the design doc as the canonical example source:

- `docs/superpowers/specs/2026-04-02-browser-session-recovery-design.md`
  - sections 6.5, 6.7, 6.8: popup behavior, grouped preview, startup entry, restore confirmations
  - section 13: V1 acceptance expectations across supported browsers
