# Directory Structure

> Recommended structure for a browser extension with popup, options, background runtime, and shared modules.

---

## Directory Layout

```text
src/
├── entrypoints/
│   ├── background/
│   ├── popup/
│   └── options/
├── features/
│   ├── session-capture/
│   ├── snapshot-history/
│   ├── restore-session/
│   └── settings/
├── components/
│   ├── ui/
│   └── layout/
├── hooks/
├── lib/
│   ├── browser/
│   ├── storage/
│   ├── logging/
│   └── time/
├── models/
├── schemas/
├── styles/
└── test/
```

---

## Organization Rules

- Keep browser entrypoints isolated under `entrypoints/`.
- Put feature logic in `features/`, not inside route or component folders.
- Put direct extension API wrappers in `lib/browser/`.
- Put persisted data transforms and repository-like logic in `lib/storage/`.
- Put shared domain types in `models/` or `schemas/`, not inside random component files.

---

## Boundary Rules

- `entrypoints/background/` orchestrates capture, autosave, startup reconciliation, and restore triggers.
- `entrypoints/popup/` is a thin UI shell over feature hooks and components.
- `entrypoints/options/` owns user-editable settings and diagnostics, if present.
- Components should depend on features and hooks, not the other way around.

---

## Naming Conventions

- folders: kebab-case
- React components: PascalCase
- hooks: `useXxx`
- browser adapter files: verb-oriented names such as `query-tabs.ts`, `create-window.ts`
- schema files: noun-oriented names such as `snapshot-schema.ts`

---

## Placement Rules

- If code exists only to render UI, keep it near components or hooks.
- If code can run without React, it belongs in `features/`, `lib/`, `models/`, or `schemas/`.
- Do not place persisted contract definitions in UI folders.
