# Compatibility Guidelines

> Browser support and API usage rules for the extension.

---

## Supported Targets

First-class support:

- Chrome
- Edge
- Firefox

Not in first release:

- Safari

Design choices should avoid making Safari support harder later, but Safari support is not a current acceptance requirement.

---

## Product Levels

The product now supports three runtime shapes:

- Level 1: pure extension using extension-local storage
- Level 2: extension plus local host via Native Messaging
- Level 3: extension plus local host plus remote database

Compatibility work must specify which level it applies to.

---

## API Strategy

- Prefer standard WebExtensions APIs shared by Chrome, Edge, and Firefox.
- Keep browser-specific behavior behind a thin adapter layer.
- Do not scatter browser detection and compatibility branches through feature logic.
- Keep product-level differences behind dedicated adapters as well:
  - extension storage adapter
  - Native Messaging host adapter
  - remote repository adapter

---

## Module Boundary Rule

The rest of the codebase should depend on project adapters, not on direct `chrome.*` or `browser.*` calls everywhere.

Good boundary examples:

- tab and window query helpers
- storage wrapper
- restore executor adapter
- feature detection helper
- native host bridge

---

## Capability Rules

- Treat browser support differences as capabilities to detect, not assumptions.
- When an API behaves differently across browsers, document:
  - expected behavior
  - fallback behavior
  - test coverage needed
- Unsupported optional features must degrade cleanly without blocking core save and restore flows.
- Each browser extension instance restores only its own browser data; do not design for cross-browser shared recovery in V1.
- Level 2 and Level 3 features must degrade to a clear Level 1-compatible message when host communication is unavailable.

---

## Permission Rules

- Request the smallest permission set needed for session capture and restore.
- New permissions require an explicit product reason in the spec or PRD.
- Do not add broad host permissions unless a concrete recovery requirement needs them.
- Native Messaging permission and host registration must be treated as explicit product-level setup, not a silent dependency.

---

## Restore Behavior

- Restore into new windows by default.
- Preserve original tab order when possible.
- Preserve original window grouping when possible.
- Never assume window IDs survive across restarts.
- Exclude URLs that the target browser cannot or should not reopen, such as internal pages and extension pages.

Restore fidelity depends on configured dedup strategy:

- `strict`: best-effort structural recovery, lowest storage cost
- `per-window`: preserve window grouping with per-window dedup
- `none`: highest fidelity, highest storage cost

---

## Capture Filtering

Apply collection filtering as close to the browser adapter boundary as possible.

- exclude internal browser pages
- exclude extension-owned pages
- exclude new-tab pages
- exclude incognito windows
- treat local file URLs as optional and settings-controlled

Restore should still revalidate URLs even after collection-time filtering.

---

## Native Messaging Boundary

For Level 2 and Level 3:

- the extension communicates only with a small host bridge contract
- the browser-side code must not know SQLite, PostgreSQL, or MySQL specifics
- host availability, version mismatch, and transport failures must map to explicit error states

Do not let Native Messaging transport details leak into UI components or browser adapters.

---

## Forbidden Patterns

- Chromium-only APIs in core logic without a fallback
- Browser branching mixed into UI components
- Depending on crash-detection semantics to decide whether recovery is allowed

---

## Current Project References

Until implementation code exists, treat the design doc as the canonical example source:

- `docs/2026-04-02-browser-session-recovery-design.md`
  - section 5: target browsers and WebExtensions direction
  - section 5.1: Safari compatibility boundary and adapter strategy
  - section 5.2 and 5.3: Level 1/2/3 product shape and Native Messaging boundary
  - section 6.11: capture filtering rules for unsupported page types
