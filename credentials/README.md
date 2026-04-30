# credentials/

This folder holds **your personal connection file**. It stays on your computer.

## What's inside

| File | Purpose |
| --- | --- |
| `config.js` | Sets `window.BIZMGR_CONFIG = { url, key }`. The app loads it on startup so you skip the wizard. |

## Why a folder?

So it's obvious where your secrets live, and so a single line in `.gitignore`
(`credentials/`) keeps everything in here out of git. If you ever push the
project to GitHub, this folder simply won't be uploaded.

## Use on another device

Two options:

1. **Easy**: copy this folder to the other device alongside the rest of the project.
2. **Easier**: open the app on the new device → setup wizard appears → paste URL and key → it saves to that browser's storage.

## What goes here

- `config.js` — yes (it sets `window.BIZMGR_CONFIG`)
- The publishable key (`sb_publishable_…`) — yes
- Database password / connection string with password — **NO**, the browser app never uses these
- The `service_role` / `sb_secret_…` key — **NEVER**, that key bypasses Row Level Security

## What if I deploy this to GitHub Pages?

Don't put `credentials/` in the upload. Instead, open the deployed site once,
the wizard will prompt for URL and key, and the browser saves them in
`localStorage` for that domain. Same effect, no key in source.
