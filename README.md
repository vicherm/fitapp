# React + TypeScript + Vite

## Supabase Setup

Copy `.env.example` to `.env.local` and provide the Vite environment values:

```env
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=your-publishable-key
```

Apply `supabase/migrations/202609230001_initial_schema.sql` through the Supabase SQL Editor. The migration creates the GymLog tables, constraints, signup settings trigger, authenticated grants, and Row Level Security policies. The application reads and writes Supabase through `src/data/`.

Apply `supabase/migrations/202609230002_restrict_to_google_user.sql` after the initial schema. In Supabase Authentication, enable Google and configure its OAuth client. The Google authorized redirect URI is:

```text
https://dhxckgfuapniettrohvo.supabase.co/auth/v1/callback
```

The OAuth setup has two different redirect URL lists:

1. In Google Cloud Console, add only the Supabase callback above as an Authorized redirect URI.
2. In Supabase Authentication -> URL Configuration, add these exact app URLs as Redirect URLs:

```text
http://localhost:5173/fitapp/
http://127.0.0.1:5173/fitapp/
```

The URL must match the browser address exactly; `localhost` and `127.0.0.1` are different origins. Set the Site URL to the deployed GymLog URL, or to one of the local URLs while testing. In Supabase Authentication -> Providers -> Google, switch Google to Enabled and save the Google OAuth client ID and secret. After the permitted Google account has signed in successfully once, new-user registration can be disabled in Supabase to prevent creation of additional Auth users.

## Strava Edge Function secrets

Strava secrets belong in Supabase Edge Function secrets, not in `.env.local` or any `VITE_*` variable. The expected names are documented in `supabase/functions/.env.example`. After installing and logging into the Supabase CLI, set them from the current PowerShell session:

```powershell
$env:STRAVA_CLIENT_ID = '<strava-client-id>'
$env:STRAVA_CLIENT_SECRET = '<strava-client-secret>'
$env:STRAVA_REDIRECT_URI = 'https://dhxckgfuapniettrohvo.supabase.co/functions/v1/strava-oauth-callback'
.\scripts\set-supabase-strava-secrets.ps1
```

The helper uses a temporary file and deletes it after `supabase secrets set` completes. It does not add the values to the repository or expose them to the browser. Configure the same callback URL in the Strava API application settings.

## One-time JSON import

Historical GymLog JSON backups can be imported into Supabase after the permitted Google user exists. This command is a Node-only migration and requires the Supabase **service-role** key. Never put that key in a `VITE_*` variable, commit it, or use it in browser code.

In PowerShell, set the secret for the current terminal session and run the importer:

```powershell
$env:SUPABASE_SERVICE_ROLE_KEY = '<service-role-key-from-supabase>'
$env:SUPABASE_USER_EMAIL = 'miroslav.vicher@gmail.com'
npm run import:supabase
```

The default input is `test_data/gymlog-backup.json`. To use another backup:

```powershell
npm run import:supabase -- --backup path/to/gymlog-backup.json
```

The importer converts the old camelCase fields to the Supabase snake_case schema, adds the authenticated owner, remaps numeric IDs and foreign keys, supplies defaults for fields missing in older backups, verifies destination counts, and refuses to overwrite existing non-settings data. Inserts are batched for Windows command-line limits. If an interrupted import left partial data, use the explicit reset option only when those rows are disposable:

```powershell
npm run import:supabase -- --reset
```

The reset removes this user's workout data, exercises, gyms, and body-part groups before importing again; it keeps settings. Do not run it after a successful import unless the destination data is intentionally being replaced.

This template provides a minimal setup to get React working in Vite with HMR and some Oxlint rules.

Currently, two official plugins are available:


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

- Prefixes like `LEG`, `BIC`, `CHE`, `BAC`, `TRI` are mapped to body part groups.
