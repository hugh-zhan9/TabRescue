# Type Safety

> Persisted session data and restore flows need explicit contracts.

---

## Type Organization

- Shared domain entities live in `models/` or `schemas/`.
- Keep UI-only view types close to the hook or component that owns them.
- Separate persisted entities from browser adapter return types when their shapes differ.

---

## Boundary Validation

- Runtime validation is required when reading from extension storage.
- Validate data that crosses browser API and storage boundaries.
- Internal UI-only transforms do not need repeated validation if they start from validated types.

---

## Preferred Patterns

- discriminated unions for async UI state and operation results
- explicit string unions or enums for error codes
- small mappers that convert browser API objects into persisted project models
- explicit unions for storage level and dedup strategy

---

## Naming Rules

- `Snapshot`, `WindowSnapshot`, `TabSnapshot` for persisted domain models
- `RestorePlan`, `RestoreResult` for restore execution types
- `Settings` for user-editable preferences
- `StorageLevel` for `1 | 2 | 3` or named level union
- `DedupStrategy` for `strict | per-window | none`
- `HostStatus` or equivalent for Native Messaging availability state

Name types after the domain concept, not the implementation detail.

---

## Cross-Level Contracts

- Level 1 persisted JSON shape and Level 2/3 repository DTOs may differ physically, but must map to the same domain contracts.
- Host transport payloads should have their own request/response DTOs instead of reusing UI types directly.
- Settings types must include `storage.level` and `dedup.strategy` as explicit fields.

---

## Forbidden Patterns

- `any`
- non-null assertions for browser-provided data
- broad `as` assertions to bypass validation
- reusing raw browser tab objects as persisted storage types
- mixing Native Messaging transport payloads with domain entities in one shared type
