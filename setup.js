// setup.js — friendly one-page wizard for entering Supabase credentials.
// Three steps:
//   1. "Why do I need this?" intro
//   2. Form (URL + anon key) with a Test Connection button
//   3. Saved → click to enter the app

import { setCreds, testConnection, getCreds, isConfigSourced } from './db.js';
import { mount, esc, toast } from './ui.js';

export function renderSetup(target, { onDone }) {
  // Pre-fill from any saved values so users can easily edit
  const existing = getCreds() || { url: '', key: '' };
  const fromConfig = isConfigSourced();

  mount(target, `
    <div class="min-h-screen flex items-center justify-center p-4">
      <div class="card w-full max-w-lg">
        <div class="flex items-center gap-3 mb-2">
          <div class="w-10 h-10 rounded-lg bg-primary text-white flex items-center justify-center font-bold text-xl">B</div>
          <h1 class="text-2xl font-bold">Connect your database</h1>
        </div>
        <p class="text-sm text-slate-600 dark:text-slate-300 mb-4">
          BizManager Lite stores your business data in <b>your own</b> free Supabase project.
          You only need to do this once on each device.
          <a href="SETUP_GUIDE.md" target="_blank" class="text-primary underline">Step-by-step guide</a>.
        </p>

        ${fromConfig ? `
          <div class="mb-4 p-3 rounded-lg text-sm bg-blue-50 text-blue-900 dark:bg-blue-900/30 dark:text-blue-100">
            ✨ Values loaded from <code>credentials/config.js</code>. Click
            <b>Save &amp; continue</b> to use them, or edit below to override.
          </div>` : ''}

        <form id="setup-form" class="space-y-4">
          <div>
            <label class="block text-sm font-medium mb-1">1. Supabase Project URL</label>
            <input id="url" class="field" type="url"
                   value="${esc(existing.url)}"
                   placeholder="https://xxxxxxxx.supabase.co" required />
            <p class="text-xs text-slate-500 mt-1">
              Found in Supabase ▸ Project Settings ▸ Data API ▸ <i>Project URL</i>.
            </p>
          </div>

          <div>
            <label class="block text-sm font-medium mb-1">2. Public anon key</label>
            <input id="key" class="field" type="password"
                   value="${esc(existing.key)}"
                   placeholder="eyJhbGciOi..." required />
            <p class="text-xs text-slate-500 mt-1">
              Same page, labelled <i>anon public</i>. It is safe to use in the browser
              <b>only because</b> the schema enables Row Level Security.
            </p>
            <label class="text-xs flex items-center gap-1 mt-1 cursor-pointer">
              <input type="checkbox" id="show-key" /> Show key
            </label>
          </div>

          <div id="status" class="text-sm hidden"></div>

          <div class="flex flex-wrap gap-2 justify-end pt-2">
            <button type="button" id="test-btn" class="btn btn-ghost">Test connection</button>
            <button type="submit" class="btn btn-primary">Save &amp; continue</button>
          </div>
        </form>

        <details class="mt-6 text-sm">
          <summary class="cursor-pointer text-slate-600 dark:text-slate-300">
            I haven't created a Supabase project yet
          </summary>
          <ol class="list-decimal pl-6 mt-2 space-y-1 text-slate-600 dark:text-slate-300">
            <li>Go to <a href="https://supabase.com" target="_blank" class="text-primary underline">supabase.com</a> and sign in (free).</li>
            <li>Click <b>New Project</b>. Give it any name and password, pick the closest region.</li>
            <li>Open <b>SQL Editor ▸ New query</b>. Paste the file <code>supabase-schema.sql</code> from this app and click <b>Run</b>.</li>
            <li>Back here, paste the URL and the <i>anon public</i> key.</li>
          </ol>
        </details>
      </div>
    </div>
  `);

  const $ = (id) => target.querySelector(id);
  const status = $('#status');
  const showStatus = (msg, ok) => {
    status.className = 'text-sm p-3 rounded-lg ' +
      (ok ? 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-200'
          : 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200');
    status.textContent = msg;
    status.classList.remove('hidden');
  };

  $('#show-key').onchange = (e) => {
    $('#key').type = e.target.checked ? 'text' : 'password';
  };

  $('#test-btn').onclick = async () => {
    const url = $('#url').value.trim();
    const key = $('#key').value.trim();
    if (!url || !key) {
      showStatus('Fill in both fields first.', false);
      return;
    }
    showStatus('Testing…', true);
    const r = await testConnection(url, key);
    showStatus(r.message, r.ok);
  };

  $('#setup-form').onsubmit = async (e) => {
    e.preventDefault();
    const url = $('#url').value.trim();
    const key = $('#key').value.trim();
    showStatus('Testing before saving…', true);
    const r = await testConnection(url, key);
    if (!r.ok) {
      showStatus(r.message, false);
      return;
    }
    setCreds({ url, key });
    toast('Connected!', 'success');
    onDone();
  };
}
