# Hook Guidelines

> Hooks are for UI-facing state and actions, not for hiding unrelated runtime complexity.

---

## What Hooks Should Do

- Subscribe UI to snapshot summaries, settings, and restore progress.
- Expose a small action surface to components.
- Translate async operations into renderable state: loading, success, error, partial success.

---

## What Hooks Should Not Do

- Own long-running background event listeners that should live in the extension runtime
- Define persisted schema contracts
- Mix browser compatibility branching with presentation logic

---

## Recommended Hook Shapes

- `useLatestSnapshot()`
- `useSnapshotHistory()`
- `useRestoreSession()`
- `useSettings()`

These hooks should return a compact, explicit shape instead of leaking implementation details.

---

## Async State Rules

- Expose clear transient states for manual save and restore actions.
- Surface stable error codes or normalized messages, not raw exception objects.
- When actions are destructive or large, expose summary data first so the component can confirm intent.

---

## Naming Rules

- Hooks start with `use`.
- Name hooks after the UI concern they serve, not the low-level API they call.
- Avoid generic names like `useData` or `useBrowser`.

---

## Forbidden Patterns

- Hook that both fetches UI data and writes storage on mount without user intent
- Hook returning many unrelated actions and state slices
- Hook callers needing to know browser-specific quirks
