# Engineering Guidelines

> Project-wide engineering rules for the browser session recovery product.

---

## Overview

This project is a browser-first product with multiple deployment levels, not a traditional backend service.
Use this directory for non-UI standards that still apply across the codebase:

- error handling and recovery behavior
- logging and debug output
- storage schema and persistence rules
- Level 1 / 2 / 3 product-shape boundaries
- Native Messaging and host communication rules
- browser compatibility boundaries
- quality and testing requirements

---

## Guidelines Index

| Guide | Description |
|-------|-------------|
| [Error Handling](./error-handling.md) | Stable error codes, boundary handling, user-visible failures |
| [Logging Guidelines](./logging-guidelines.md) | Logger usage, levels, required context, sensitive data rules |
| [Storage Guidelines](./storage-guidelines.md) | Persisted schema, migrations, snapshot retention, settings |
| [Compatibility Guidelines](./compatibility-guidelines.md) | Chrome / Edge / Firefox support strategy and API boundaries |
| [Quality Guidelines](./quality-guidelines.md) | Testing, review checks, module boundaries, release criteria |

---

## Pre-Development Checklist

- Read this index first.
- If the change touches persistence, read [Storage Guidelines](./storage-guidelines.md).
- If the change touches storage level, host integration, or migrations between modes, read [Storage Guidelines](./storage-guidelines.md).
- If the change touches browser APIs or support differences, read [Compatibility Guidelines](./compatibility-guidelines.md).
- If the change introduces failure states or recovery flows, read [Error Handling](./error-handling.md).
- Always read [Quality Guidelines](./quality-guidelines.md) before shipping.

---

## Scope Rule

Put guidance here when it applies to multiple extension surfaces or to non-React code, for example:

- background or service worker modules
- browser API adapters
- storage and migration logic
- Native Messaging bridge and host-side contracts
- restore orchestration
- project-wide logging and failure handling

Put UI-only rules in `frontend/`.
