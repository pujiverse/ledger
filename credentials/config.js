// BizManager Lite — credentials file (LOCAL ONLY).
//
// This file lives only on your computer. It is excluded from git via .gitignore,
// so it cannot accidentally be uploaded to GitHub.
//
// The app reads `window.BIZMGR_CONFIG` on startup. If both fields are filled in,
// you skip the setup wizard entirely and go straight to the dashboard.
//
// Need a different account on this device? Either edit the values below
// or open the app and click "Change connection" in Settings.

window.BIZMGR_CONFIG = {
  // From Supabase ▸ Project Settings ▸ Data API ▸ Project URL
  url: 'https://evgvsqcmywfjgzytocmb.supabase.co',

  // The PUBLISHABLE key (starts with `sb_publishable_…` or the older `eyJ…`).
  // It is meant to be exposed to the browser — Row Level Security in
  // supabase-schema.sql is what protects your data.
  // NEVER paste a `sb_secret_…` or `service_role` key here.
  key: 'sb_publishable_bSl2mTlFbxcQlZuYuyRbiA_ZijfrFsG'
};
