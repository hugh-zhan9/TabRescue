# Component Guidelines

> Rules for popup and options UI components in a constrained browser-extension surface.

---

## Component Responsibilities

- Components render state and emit user intent.
- Components should not own browser API access, storage writes, or restore orchestration.
- Complex actions such as "restore latest snapshot" should be triggered through hooks or feature actions.

---

## Component Structure

Prefer small components with one visible responsibility:

- page shell or section container
- summary card
- snapshot list
- window-group preview
- restore action bar
- settings form row

Split when a file is doing both layout and action orchestration.

---

## Props Rules

- Prefer explicit props over context-heavy hidden dependencies.
- Pass typed view data, not raw storage payloads where avoidable.
- Use event-like props for actions: `onRestore`, `onSaveNow`, `onDismiss`.
- Avoid boolean prop explosions. Prefer a small variant union when behavior meaningfully changes.

---

## Styling Rules

- Optimize for compact extension UI first.
- Use a small shared design vocabulary for spacing, typography, and status colors.
- Keep action affordances obvious; restore is the primary action.
- Do not hide important failure or partial-restore information behind hover-only UI.
- Organize snapshot previews by browser window when showing details.
- Keep the passive startup model clear: badge or popup entry first, not surprise modal behavior by default.

---

## Accessibility

- Buttons and controls must have clear accessible names.
- Snapshot summaries must remain understandable with screen readers.
- Focus order matters in popup UIs because space is constrained.
- Status and failure states must not rely on color alone.
- Confirmation flows for medium and large restores must remain keyboard-accessible.

---

## Forbidden Patterns

- Components importing `chrome.*` or `browser.*` directly
- Storage writes from render-driven effects
- Dense dashboard UI that hides the primary restore flow
- Unlabeled icon-only controls for critical actions

---

## Current Project References

Until implementation code exists, treat the design doc as the canonical example source:

- `docs/superpowers/specs/2026-04-02-browser-session-recovery-design.md`
  - sections 6.5 and 6.7: popup layout, preview list, restore action, save-now action
  - section 6.8: passive startup UX and badge-first recovery entry
  - section 6.11: snapshot summary and failure message presentation
