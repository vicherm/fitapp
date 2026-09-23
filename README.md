# React + TypeScript + Vite

## Supabase Setup

Copy `.env.example` to `.env.local` and provide the Vite environment values:

```env
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=your-publishable-key
```

Apply `supabase/migrations/202609230001_initial_schema.sql` through the Supabase SQL Editor. The migration creates the GymLog tables, constraints, signup settings trigger, authenticated grants, and Row Level Security policies. The current application still reads and writes Dexie until the later data-access migration is complete.

This template provides a minimal setup to get React working in Vite with HMR and some Oxlint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Oxc](https://oxc.rs)
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/)

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the Oxlint configuration

If you are developing a production application, we recommend enabling type-aware lint rules by installing `oxlint-tsgolint` and editing `.oxlintrc.json`:

```json
{
  "$schema": "./node_modules/oxlint/configuration_schema.json",
  "plugins": ["react", "typescript", "oxc"],
  "options": {
    "typeAware": true
  },
  "rules": {
    "react/rules-of-hooks": "error",
    "react/only-export-components": ["warn", { "allowConstantExport": true }]
  }
}
```

See the [Oxlint rules documentation](https://oxc.rs/docs/guide/usage/linter/rules) for the full list of rules and categories.

## HeavySet CSV Migration

Convert a HeavySet CSV export to a GymLog JSON backup file compatible with Home -> Import JSON.

```bash
npm run convert:heavyset -- --input test_data/heavyset-export.csv --output test_data/gymlog-backup.json
```

Options:

- `--gap-minutes <n>`: splits workouts when the time gap between rows exceeds `n` minutes (default: `180`)

Exercise naming convention support:

- Prefixes like `LEG`, `BIC`, `CHE`, `BAC`, `TRI` are mapped to body part groups (e.g. `LEG` -> `Legs`, `BIC` -> `Biceps`)
