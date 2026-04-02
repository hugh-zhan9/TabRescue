# Storage Guidelines

> Persistence rules for current session state, snapshots, and settings.

---

## Storage Model

The project uses a dual-write recovery model across three storage levels:

- `currentSession`: real-time source of truth
- `snapshots`: periodic or manual archive copies
- `settings`: user preferences, storage level, and dedup strategy
- `schemaVersion`: explicit migration version

For Level 2 and Level 3, recovery storage must be normalized:

- `pages` / `urls`: durable URL entity table
- `snapshots`: point-in-time recovery records
- snapshot-to-window and snapshot-to-tab association tables

The URL entity table is durable product data, not disposable snapshot payload.
Deleting old snapshots must not delete canonical URL records.

Supported levels:

- Level 1: extension-local JSON storage
- Level 2: Native Messaging to local SQLite host
- Level 3: Native Messaging to remote PostgreSQL/MySQL through the host

Do not persist transient UI state in the same store as recovery data.

---

## Session and Snapshot Shape

`currentSession` should persist the latest known browser state:

- session metadata
- current windows
- current tabs

`snapshots` should persist time-point archives copied from `currentSession`.

For Level 2 and Level 3:

- persist a canonical URL/page record with a stable page id
- enforce a unique index on the normalized URL key
- let snapshots reference canonical page ids instead of duplicating URL rows as the primary storage model
- keep snapshot-specific fields such as window placement and tab index in association rows

Each snapshot should contain:

- stable snapshot id
- creation timestamp
- window list
- tab list grouped by window
- summary metadata for UI display

Canonical page records should retain:

- normalized URL
- latest known title
- first seen at
- last seen at
- optional browser/source metadata when needed

Per-tab persisted fields should follow the design contract:

- URL
- title
- window reference
- tab index
- pin state when needed for restore behavior
- opened and updated timestamps when retained

Dedup behavior is configurable:

- `strict`
- `per-window`
- `none`

Default strategy is `per-window`.
Any implementation must make dedup strategy part of the stored settings and the test matrix.

Do not persist internal helper fields that exist only during runtime orchestration.

---

## Versioning and Migration

- Persist an explicit `schemaVersion`.
- Migration code must be additive and readable.
- A new schema version must define:
  - how old data is detected
  - how it is upgraded
  - what happens if upgrade fails
- Failed migration must not destroy all user data unless the stored format is unrecoverable.

---

## Write Strategy

- Update `currentSession` on every relevant tab and window event.
- Create a full archived snapshot on throttle interval or manual save.
- Default snapshot interval is every 5 minutes unless settings override it.
- Browser startup should trigger a full reconciliation capture into `currentSession`.
- Startup reconciliation does not automatically overwrite historical snapshots.
- Persist snapshots atomically from validated `currentSession`, not from partially updated fragments.

Level-specific write expectations:

- Level 1: persist JSON-friendly shapes through extension storage APIs
- Level 2: persist through host commands backed by SQLite
- Level 3: persist through host commands backed by remote database operations

---

## Retention Rules

- Keep the most recent complete snapshot at minimum.
- Default retained snapshot count is 20 unless settings override it.
- Trim old snapshots during successful writes, not as a separate fragile cleanup job.
- If deleted-tab retention exists in the chosen storage model, treat it as a secondary cleanup concern, not as the primary recovery path.
- Level 1 retention defaults must account for extension storage size limits.
- Level 2 and Level 3 may allow larger retention windows, but semantics must stay the same.
- Level 2 and Level 3 snapshot cleanup must delete snapshot association rows and snapshot metadata rows only.
- Snapshot cleanup must not cascade into deleting canonical URL/page rows.

---

## Validation Rules

- Validate data when reading from storage, not only before writing.
- Treat `schemaVersion` and snapshot identity fields as required.
- Ignore unknown fields from older or future versions rather than depending on them.
- Filter unsupported URLs before persistence where possible.
- Revalidate stored URLs again before restore.
- Validate storage-level transitions before migrating data between Level 1, 2, and 3.

---

## Storage Backend Rule

The design currently allows pluggable storage implementations behind a repository boundary.

- business logic must depend on a storage abstraction
- storage mode selection belongs in settings or bootstrap configuration
- schema and recovery semantics must remain consistent across adapters
- host communication belongs to the adapter boundary, not the domain layer

Do not leak storage-engine-specific behavior into capture, restore, or UI modules.

---

## Migration and Mode Switching

Storage-level transitions are a first-class product flow:

- Level 1 → Level 2: export extension-local data and import into SQLite-backed host storage
- Level 2 → Level 3: migrate SQLite-backed data into remote DB-backed storage
- Level 3 → Level 2: allow fallback to local host storage
- Level 2 → Level 1: warn about capacity limits before downgrade

Mode switching rules:

- migrate data explicitly, do not rely on implicit lazy reads from old backends
- preserve dedup strategy unless the user changes it separately
- report migration progress and failure clearly

---

## Forbidden Patterns

- Persisting browser-native IDs as long-term identity across restarts
- Mixing settings writes with snapshot writes in the same ad hoc shape
- Storing derived UI-only text that can be recomputed
- Writing every tab event directly to storage without throttling
- Letting adapter-specific schema differences leak into domain logic
- Hardcoding a single dedup strategy in storage logic
- Making Level 2 or Level 3 a hidden prerequisite for basic recovery
- Modeling database-backed snapshots as opaque blobs when canonical URL entities are required
- Deleting durable URL records as a side effect of snapshot retention cleanup

---

## Required Test Cases

- Upgrade from previous schema version
- Trimming snapshot history to configured limit
- Startup reconciliation after missed shutdown events
- Read path behavior with partially malformed stored data
- `currentSession` updates immediately while `snapshots` update only on interval or manual save
- Storage level migration between Level 1 and Level 2
- Dedup strategy behavior for `strict`, `per-window`, and `none`
- Level 1 capacity-aware retention behavior

---

## Current Project References

Until implementation code exists, treat the design doc as the canonical example source:

- `docs/superpowers/specs/2026-04-02-browser-session-recovery-design.md`
  - sections 5.2 and 5.3: Level 1/2/3 architecture and storage abstraction
  - sections 6.1, 6.2, 6.3, 6.9: dedup strategy, dual-write model, and snapshot timing
  - section 7.5: current session and snapshot table shapes
  - sections 7.6 and 7.8: update semantics and mode upgrade paths
