# Frontend Development Guidelines

> UI and extension-surface standards for the browser session recovery project.

---

## Overview

This project is primarily a browser extension frontend. That includes:

- popup UI
- options or settings UI
- any onboarding or recovery prompt UI
- extension-facing hooks and view models
- shared types used by those UI surfaces

Use `engineering/` for storage, compatibility, logging, and runtime rules that also apply outside React components.

---

## Guidelines Index

| Guide | Description |
|-------|-------------|
| [Directory Structure](./directory-structure.md) | Entrypoints, feature folders, shared browser adapters, assets |
| [Component Guidelines](./component-guidelines.md) | Popup and options components, props, accessibility, browser-UI constraints |
| [Hook Guidelines](./hook-guidelines.md) | View-model hooks, async state, browser-facing hook boundaries |
| [State Management](./state-management.md) | Local UI state, persisted extension state, derived summaries |
| [Quality Guidelines](./quality-guidelines.md) | Frontend review bar, tests, accessibility, behavior checks |
| [Type Safety](./type-safety.md) | Shared DTOs, runtime validation at boundaries, TypeScript rules |

---

## Pre-Development Checklist

- Read this index first.
- UI changes: read [Component Guidelines](./component-guidelines.md).
- Async UI or browser state subscription changes: read [Hook Guidelines](./hook-guidelines.md).
- New stored or shared data shapes: read [Type Safety](./type-safety.md) and `engineering/storage-guidelines.md`.
- Any frontend work: read [Quality Guidelines](./quality-guidelines.md).
