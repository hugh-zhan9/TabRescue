# Logging Guidelines

> Logging rules for background runtime, restore flows, and debugging.

---

## Goals

- Make background behavior explainable during development and support.
- Keep production logs low-noise and privacy-aware.
- Make multi-step flows traceable: capture, persist, restore, migrate.

---

## Logger Rules

- Use a shared logger wrapper instead of scattered `console.log`.
- Logs should be structured enough to filter by operation and phase.
- The logger API should stay small: `debug`, `info`, `warn`, `error`.

---

## What to Include

Add compact context fields when relevant:

- `operation`: `capture`, `snapshot_save`, `snapshot_restore`, `migration`
- `snapshotId`
- `windowCount`
- `tabCount`
- `browserTarget` when behavior differs by browser
- stable error `code`

Prefer stable IDs and counters over dumping full objects.

---

## What Not to Log

- Full URL query strings if they may contain secrets or tokens
- cookies, headers, auth tokens, local credentials
- full snapshot payloads in normal operation
- noisy per-event logs in hot paths unless behind debug mode

If a URL is needed for debugging, log the origin or a redacted form.

---

## Log Levels

- `debug`: throttled diagnostics, event batching details, storage timing
- `info`: successful manual save, restore started, restore completed
- `warn`: recoverable validation issue, skipped tab, dropped bad snapshot
- `error`: storage failure, migration failure, restore flow failure

---

## Patterns to Follow

- Log once per failed operation at the boundary where the failure is understood.
- For batched work, log a summary rather than one line per tab unless debugging.
- Pair user-visible failures with a log entry carrying the same stable error code.

---

## Forbidden Patterns

- Raw `console.log` left in shipped code
- Logging inside render paths
- Logging full storage payloads by default
- Duplicating the same error log across multiple layers
