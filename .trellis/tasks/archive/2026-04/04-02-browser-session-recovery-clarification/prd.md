# Brainstorm: Browser Session Recovery Clarification

## Goal

Review `docs/superpowers/specs/2026-04-02-browser-session-recovery-design.md`, confirm whether it is now sufficient for MVP implementation, and sync the Trellis project specs to match the current design.

## What I Already Know

- The project direction is a local-first browser extension for browser session recovery.
- Current target browsers are Chrome, Edge, and Firefox.
- Safari is explicitly out of scope for V1.
- The design document defines the product goal, non-goals, core scenarios, storage principles, and reliability expectations.
- The repo currently contains the design doc and project specs, but no implementation code yet.
- The project has already been reframed around `frontend/` and `engineering/` specs rather than a traditional backend split.

## Assumptions (Temporary)

- The design document is now treated as substantially complete for MVP.
- Remaining tension points are implementation trade-offs, not blockers for moving forward.
- The immediate output should be synchronized spec documents rather than more requirement churn.

## Open Questions

- No blocking product questions remain for MVP.
- Any remaining questions should be handled during implementation planning, not by reopening product scope.

## Requirements

- Treat the current design doc as the primary product and architecture reference for MVP.
- Sync `.trellis/spec/frontend/` and `.trellis/spec/engineering/` with the concrete rules now present in the design doc.
- Preserve the current MVP scope without reopening broader product decisions.

## Acceptance Criteria

- [x] The current design doc is summarized accurately.
- [x] Previously ambiguous areas are re-evaluated against the updated document.
- [x] Trellis spec documents are updated to reflect the current design.
- [x] The design is considered sufficient to proceed to implementation planning.

## Definition of Done

- Requirements are considered clear enough for implementation planning.
- Trellis spec documents reflect the current design direction.
- The next step can move from brainstorm to implementation planning without additional product discovery.

## Out of Scope (Explicit)

- Extension implementation
- Manifest or build tooling selection
- Detailed UI copywriting beyond what affects requirements clarity

## Technical Notes

- Primary reference: `docs/superpowers/specs/2026-04-02-browser-session-recovery-design.md`
- Related context: `.trellis/spec/frontend/` and `.trellis/spec/engineering/`
- Repo context: no extension source files are present yet
- The design doc now includes executable details for:
  - dual-write storage model
  - graded restore confirmation
  - passive startup behavior
  - capture filtering rules
  - UI failure presentation rules

## Clarified Reading

After a second pass, several earlier concerns are already clear enough for MVP:

- Restore UX is clear at the requirement level.
  - The product must support one-click restore of the latest snapshot.
  - It must also support reviewing snapshot summaries before restore.
  - The document now defines graded confirmation rules based on snapshot size.
- Startup behavior is mostly clear.
  - Default behavior is passive: no startup popup, badge indicates recoverable state.
  - A startup prompt is optional and controlled by settings.
- Snapshot retention intent is clear.
  - `currentSession` is now defined as source of truth and `snapshots` as archive.
  - Snapshot generation is periodic or manual, with explicit startup behavior.
- Browser scope is clear.
  - Chrome, Edge, Firefox are in scope; Safari, sync, cloud, and deep page state restoration are not.
- Filtering rules are now mostly clear.
  - Internal pages, extension pages, new tab pages, and incognito windows are excluded.

## Residual Notes

- The document now has enough detail for planning and implementation.
- Some implementation choices may still need ADR-level handling during coding, but they are no longer product-definition blockers.
