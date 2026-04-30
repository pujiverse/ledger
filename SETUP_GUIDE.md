# Setup guide

Goal: by the end you have **two values** to paste into the app — a *Project URL* and a *publishable key* (Supabase used to call this the "anon" key; both names mean the same thing for a browser app). They come from a free Supabase project that holds your data.

You only do this **once per device**. After that, the app remembers and you go straight to the dashboard.

> **Heads-up.** You may have seen Supabase mention CLI commands like
> `supabase login`, `supabase init`, or `supabase link --project-ref …`.
> **You do not need any of those for this app.** Those are for managing
> migrations from a developer's laptop. BizManager Lite talks to Supabase
> over HTTPS using only the URL and the publishable key.

## TL;DR — fastest possible path

If you don't want to read the whole guide, this is the shortest route:

1. Make a free project at [supabase.com](https://supabase.com).
2. SQL Editor → New query → paste `supabase-schema.sql` → Run.
3. Project Settings → Data API → copy *Project URL* and the *publishable* key.
4. Open `credentials/config.js` in this folder and paste the two values in.
5. Open `index.html`. The login screen appears.
6. Click **Sign up**, create an account with your email + a password. **The first account becomes the admin** (Mom).
7. You're in. Add Daily Business customers, create chits, etc.
8. Anyone you give the URL to can sign up too — but they'll be a *customer* who can only see their own data unless you promote them in **Settings → Users (admin)**.

If anything fails, fall back to the long version below.

## Roles in 30 seconds

| Role | Sees | Can edit |
| --- | --- | --- |
| **admin** (you) | every row in every table | every row |
| **customer** | only the rows they created themselves | only their own rows |

The first signup becomes admin automatically (a database trigger handles this). Everyone after that is a customer until an admin promotes them. The promotion control lives in **Settings → Users**, visible only to admins.

This is enforced by Row Level Security in Supabase, not by JavaScript — so even if a customer hand-writes API calls, the database refuses. Mom's chits stay safely Mom's.

---

## Part 1 — Create a Supabase project (5 minutes, free)

1. Go to <https://supabase.com> and click **Start your project**. Sign in with GitHub or email.
2. Click **New project**.
3. Fill in:
   - **Name** — anything, e.g. `bizmanager`
   - **Database password** — pick a strong one and save it somewhere (you won't need it for this app, but Supabase requires it)
   - **Region** — pick the closest to you
   - **Plan** — Free
4. Click **Create new project**. Wait ~1 minute while it provisions.

## Part 2 — Run the database schema

The app needs five tables. The repo ships them in `supabase-schema.sql` — you just paste and run.

1. In your new Supabase project, open **SQL Editor** in the left sidebar.
2. Click **New query**.
3. Open `supabase-schema.sql` from this folder, copy everything, paste into the SQL editor.
4. Click **Run** (or press <kbd>Ctrl</kbd>+<kbd>Enter</kbd>).

You should see *Success. No rows returned*. If you see a red error, scroll up — it usually says exactly which line is unhappy.

## Part 3 — Find your two credentials

1. Open **Project Settings** (gear icon, bottom-left).
2. Click **Data API**.
3. Copy **Project URL** — it looks like `https://abcdefghijkl.supabase.co`.
4. In the **API keys** section just below, find the row labelled **anon** ▸ **public**. Copy that key — it's a long `eyJ...` string.

> Why is it OK to put this key in the browser? Because the schema we ran turned on Row Level Security with a policy that lets the anon key read and write the five tables. Nothing else is exposed.
> If you ever want stricter rules (e.g. multi-user with login), edit the policies at the bottom of `supabase-schema.sql` to use `auth.uid()`.

## Part 4 — Tell the app your two values

You have two ways to do this. Pick whichever you like.

### Option A — Edit `credentials/config.js` (no wizard at all)

1. In this project folder, open `credentials/config.js`.
2. Replace the URL and key strings with your values:
   ```js
   window.BIZMGR_CONFIG = {
     url: 'https://YOUR-PROJECT-REF.supabase.co',
     key: 'sb_publishable_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx'
   };
   ```
3. Save and open `index.html`. The app skips the wizard and goes straight to Home.

The folder `credentials/` is in `.gitignore`, so even if you push the project to GitHub, your file stays on your computer. If something goes wrong (e.g. wrong key), the home page may show errors — open Settings → *Change connection* to fix.

### Option B — Use the in-browser wizard

1. Open the app.
2. The wizard greets you with *Connect your database*.
3. Paste the **Project URL** in the first field.
4. Paste the **publishable key** in the second field. Tick **Show key** to double-check.
5. Click **Test connection**. You should see *"Connected. All five tables are reachable."*
6. Click **Save & continue**.

The browser stores the values in `localStorage` for that domain — same effect as Option A, just stored in a different place.

### Option C — Set up once, share to other devices

Use Option B on the first device to confirm it works, then go to **Settings → Download config.js**. Drop the downloaded file into `credentials/` on your other computer, phone PWA, USB-stick copy, etc. They'll all auto-connect.

You'll land on the dashboard with zeros everywhere. Add a customer or an expense to see things light up.

---

## What if I'm setting up a second device (phone, work laptop, …)?

Repeat **Part 4 only**. Same URL + key on every device gives you the same data because the data lives in Supabase, not in the browser.

## What if the test connection fails?

Common causes, in order of likelihood:

| Error message contains | Fix |
| --- | --- |
| `Could not read table "customers"` | You skipped Part 2. Run the schema SQL. |
| `Invalid API key` | You pasted the *service_role* key by mistake. Use the **anon public** one. |
| `fetch failed` / `network` | Typo in the URL — make sure it ends with `.supabase.co` and has no trailing slash. |

## Changing or rotating credentials later

Open the app, go to **Settings**, click **Change connection**. Same wizard, same Test button.

To completely reset on this device, click **Disconnect this device** in Settings (or the bottom of the sidebar). Your Supabase data stays untouched.

---

## App workflow at a glance

```
First open ──► Setup wizard (URL + key)
              │
              ▼
            Login screen ──► Sign up   (first one = admin)
                          └─ Sign in   (everyone else)
              │
              ▼
            Home (dashboard)
              ├──► Daily Business     ──► Customer ──► Many small transactions (Dad's lending)
              ├──► Chits              ──► Open chit ──► Members ──► Monthly Lucky Draw 🎲
              ├──► Household Expenses ──► Add income/expense
              ├──► Loans              ──► New loan ──► Record payments
              ├──► Summary Report     ──► Print / Download CSV
              └──► Settings
                    ├─ Database connection (URL/key)
                    ├─ My account (role + sign out)
                    ├─ Users (admin only) — promote / demote
                    ├─ Bulk CSV import (per table, with templates)
                    └─ Backup & Restore (full JSON dump / restore)
```

That's the whole app. Seven pages, two gates (URL/key wizard and login), one settings screen.
