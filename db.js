// db.js — wraps the Supabase client and the auth session.
// Uses Supabase's official ESM build straight from the CDN — no npm, no bundler.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const STORE_KEY = 'bizmgr.creds.v1';

let client = null;
let cachedProfile = null;

// ------------- credentials -------------

/** Read saved credentials (or null).
 *  Priority:
 *    1. localStorage  — set by the wizard / Settings page
 *    2. window.BIZMGR_CONFIG — provided by credentials/config.js if the user
 *       wants the app to auto-connect on startup with no wizard.
 */
export function getCreds() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && parsed.url && parsed.key) return { ...parsed, source: 'browser' };
    }
  } catch {}
  if (typeof window !== 'undefined' && window.BIZMGR_CONFIG) {
    const c = window.BIZMGR_CONFIG;
    if (c.url && c.key) return { url: c.url, key: c.key, source: 'config-file' };
  }
  return null;
}

export function isConfigSourced() {
  const c = getCreds();
  return !!(c && c.source === 'config-file');
}

export function setCreds({ url, key }) {
  localStorage.setItem(STORE_KEY, JSON.stringify({ url, key }));
  client = createClient(url, key);
  cachedProfile = null;
  return client;
}

export function clearCreds() {
  localStorage.removeItem(STORE_KEY);
  client = null;
  cachedProfile = null;
}

/** Get the live client. Throws if no creds saved yet. */
export function db() {
  if (client) return client;
  const c = getCreds();
  if (!c) throw new Error('No database credentials yet. Open Settings to set them up.');
  client = createClient(c.url, c.key, {
    auth: { persistSession: true, autoRefreshToken: true }
  });
  return client;
}

/** Quick connection check. Doesn't require login — just hits the schema. */
export async function testConnection(url, key) {
  try {
    const tmp = createClient(url, key);
    // We just need to know the tables exist. select('id') will fail
    // for an unauthenticated user if RLS is on — that's still proof the
    // table exists. Anything other than "table missing" is OK.
    const tables = ['profiles', 'customers', 'expenses', 'loans', 'chits'];
    for (const t of tables) {
      const { error } = await tmp.from(t).select('id').limit(1);
      if (error && /does not exist|not found|relation .* does not exist/i.test(error.message)) {
        return {
          ok: false,
          message: `Table "${t}" is missing. Run supabase-schema.sql in the SQL editor first. (${error.message})`
        };
      }
    }
    return { ok: true, message: 'Connected. Schema looks correct.' };
  } catch (e) {
    return { ok: false, message: e.message || String(e) };
  }
}

// ------------- auth -------------

export async function getSession() {
  const { data } = await db().auth.getSession();
  return data.session || null;
}

export async function signUp(email, password, fullName) {
  const supabase = db();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { full_name: fullName || '' } }
  });
  if (error) throw error;
  return data;
}

export async function signIn(email, password) {
  const supabase = db();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  cachedProfile = null;
  return data;
}

export async function signOut() {
  await db().auth.signOut();
  cachedProfile = null;
}

export async function sendReset(email) {
  const { error } = await db().auth.resetPasswordForEmail(email, {
    redirectTo: location.origin + location.pathname
  });
  if (error) throw error;
}

/** Returns { user, profile } for the currently-signed-in user, or null. */
export async function getMe() {
  if (cachedProfile) return cachedProfile;
  const session = await getSession();
  if (!session) return null;
  const { data, error } = await db()
    .from('profiles')
    .select('id, email, full_name, role')
    .eq('id', session.user.id)
    .maybeSingle();
  // If the profile row hasn't propagated yet (rare timing on first signup), we
  // synthesize one rather than failing the whole app.
  const profile = data || { id: session.user.id, email: session.user.email, role: 'customer' };
  if (error) console.warn('getMe profile fetch warning:', error.message);
  cachedProfile = { user: session.user, profile };
  return cachedProfile;
}

/** Subscribe to login/logout events. Returns an unsubscribe function. */
export function onAuthChange(cb) {
  const supabase = db();
  const { data } = supabase.auth.onAuthStateChange(() => {
    cachedProfile = null;
    cb();
  });
  return () => data.subscription.unsubscribe();
}
