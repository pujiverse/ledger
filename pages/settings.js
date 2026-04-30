// Settings — connection info, theme, bulk CSV import, JSON backup/restore.

import { db, getCreds, setCreds, clearCreds, testConnection, isConfigSourced } from '../db.js';
import { mount, esc, toast, openModal, confirm } from '../ui.js';

const TABLES = [
  'customers', 'customer_transactions',
  'expenses',
  'loans', 'loan_transactions',
  'chits', 'chit_members', 'chit_transactions',
];

const TEMPLATES = {
  customers:             ['name', 'phone', 'address', 'status'],
  customer_transactions: ['customer_id', 'date', 'amount', 'description', 'type'],
  expenses:              ['expense_date', 'description', 'category', 'amount', 'type'],
  loans:                 ['name', 'principal', 'interest_rate', 'duration_months', 'type', 'status'],
  loan_transactions:     ['loan_id', 'date', 'amount', 'description', 'type'],
  chits:                 ['name', 'total_value', 'members_count', 'duration_months', 'status'],
  chit_members:          ['chit_id', 'name', 'phone', 'email', 'address', 'lottery_status'],
  chit_transactions:     ['member_id', 'date', 'amount', 'description', 'type'],
};

export function renderSettings(target, ctx) {
  const me = ctx?.me;
  const isAdmin = me?.profile?.role === 'admin';
  const creds = getCreds() || {};
  const source = isConfigSourced() ? 'config-file' : (creds.url ? 'browser' : 'none');
  const sourceBadge = {
    'config-file': '<span class="px-2 py-1 text-xs rounded-full bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-200">credentials/config.js</span>',
    'browser':     '<span class="px-2 py-1 text-xs rounded-full bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-200">browser storage</span>',
    'none':        '<span class="px-2 py-1 text-xs rounded-full bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-200">not set</span>',
  }[source];

  mount(target, `
    <h1 class="text-3xl font-bold mb-6">Settings</h1>

    <div class="space-y-6">
      <!-- Connection -->
      <div class="card">
        <div class="flex items-center justify-between mb-3 flex-wrap gap-2">
          <h2 class="text-xl font-semibold">Database connection</h2>
          <span class="text-sm">Source: ${sourceBadge}</span>
        </div>
        <div class="text-sm text-slate-500 mb-2">Project URL</div>
        <div class="flex gap-2 mb-3">
          <input class="field" readonly value="${esc(creds.url || 'Not configured')}">
          <button id="copy-url" class="btn btn-ghost border border-slate-300 dark:border-slate-600">Copy</button>
        </div>
        <div class="flex flex-wrap gap-2">
          <button id="reconnect"  class="btn btn-ghost border border-slate-300 dark:border-slate-600">Change connection</button>
          <button id="dl-config"  class="btn btn-ghost border border-slate-300 dark:border-slate-600" ${creds.url ? '' : 'disabled'}>⬇ Download config.js</button>
          <button id="disconnect" class="btn btn-danger">Disconnect this device</button>
        </div>
        <p class="text-xs text-slate-500 mt-3">
          Drop the downloaded <code>config.js</code> into the <code>credentials/</code> folder
          on any device to make this app auto-connect there too — no more wizard.
        </p>
      </div>

      <!-- Bulk import -->
      <div class="card">
        <h2 class="text-xl font-semibold mb-1">Bulk import (CSV)</h2>
        <p class="text-sm text-slate-500 mb-3">
          Pick a table, drop a CSV file, hit upload. The first row must contain column names.
        </p>
        <div class="flex flex-col sm:flex-row gap-2 sm:items-center">
          <select id="imp-table" class="field sm:max-w-xs">
            ${TABLES.map((t) => `<option>${t}</option>`).join('')}
          </select>
          <button id="dl-template" class="btn btn-ghost border border-slate-300 dark:border-slate-600">⬇ Template</button>
          <input id="imp-file" type="file" accept=".csv,text/csv"
                 class="text-sm file:mr-3 file:py-2 file:px-3 file:rounded-lg file:border-0 file:bg-slate-100 dark:file:bg-slate-700">
          <button id="imp-go" class="btn btn-primary">Upload</button>
        </div>
        <pre id="imp-log" class="mt-3 text-xs whitespace-pre-wrap text-slate-500"></pre>
      </div>

      <!-- My account -->
      <div class="card">
        <h2 class="text-xl font-semibold mb-3">My account</h2>
        <div class="text-sm text-slate-500">Signed in as</div>
        <div class="font-medium mb-3">${esc(me?.profile?.email || me?.user?.email || '')}</div>
        <div class="text-sm text-slate-500">Role</div>
        <div class="font-medium">
          ${isAdmin
            ? '<span class="px-2 py-0.5 text-xs rounded-full bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200 font-semibold">ADMIN</span> — can read &amp; edit every row in this database.'
            : '<span class="px-2 py-0.5 text-xs rounded-full bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-200 font-semibold">customer</span> — you only see and edit your own rows.'}
        </div>
      </div>

      ${isAdmin ? `
      <!-- Admin: manage users -->
      <div class="card">
        <h2 class="text-xl font-semibold mb-1">Users (admin)</h2>
        <p class="text-sm text-slate-500 mb-3">Promote a customer to admin or demote them. You cannot change your own role here.</p>
        <div id="users-list" class="text-sm text-slate-500">Loading…</div>
      </div>` : ''}

      <!-- Backup -->
      <div class="card">
        <h2 class="text-xl font-semibold mb-1">Backup &amp; restore</h2>
        <p class="text-sm text-slate-500 mb-3">
          Export everything to a single JSON file you can keep on your computer.
          Restore reads that same file back into the database.
        </p>
        <div class="flex flex-wrap gap-2">
          <button id="export"  class="btn btn-primary">⬇ Download backup</button>
          <label class="btn btn-ghost border border-slate-300 dark:border-slate-600 cursor-pointer">
            ⬆ Restore from file
            <input id="restore" type="file" accept="application/json,.json" class="hidden">
          </label>
        </div>
        <pre id="backup-log" class="mt-3 text-xs whitespace-pre-wrap text-slate-500"></pre>
      </div>
    </div>
  `);

  const $ = (s) => target.querySelector(s);

  // ----- connection actions -----
  $('#copy-url').onclick = async () => {
    if (!creds.url) return;
    await navigator.clipboard.writeText(creds.url);
    toast('Copied');
  };
  $('#reconnect').onclick = () => openReconnect(target);
  $('#dl-config').onclick = () => {
    if (!creds.url) return;
    const body =
      `// BizManager Lite — credentials file (LOCAL ONLY).\n` +
      `// Save this file as: credentials/config.js\n` +
      `// It is gitignored, so it will not reach GitHub.\n\n` +
      `window.BIZMGR_CONFIG = ${JSON.stringify({ url: creds.url, key: creds.key }, null, 2)};\n`;
    download(body, 'config.js', 'text/javascript');
    toast('config.js downloaded — drop it into credentials/');
  };
  $('#disconnect').onclick = async () => {
    if (!await confirm('Forget the saved Supabase URL and key on this device?')) return;
    clearCreds();
    location.hash = '';
    location.reload();
  };

  // ----- import -----
  $('#dl-template').onclick = () => {
    const t = $('#imp-table').value;
    const csv = TEMPLATES[t].join(',') + '\n';
    download(csv, `${t}-template.csv`, 'text/csv');
  };
  $('#imp-go').onclick = async () => {
    const file = $('#imp-file').files[0];
    if (!file) return toast('Pick a CSV file first', 'error');
    const text = await file.text();
    const table = $('#imp-table').value;
    const log = $('#imp-log');
    log.textContent = `Parsing ${file.name}…`;
    try {
      const rows = parseCsv(text);
      if (rows.length === 0) throw new Error('CSV has no rows.');
      const cleaned = rows.map((r) => coerceRow(table, r));
      log.textContent += `\nUploading ${cleaned.length} rows to "${table}"…`;
      const supabase = db();
      const { error } = await supabase.from(table).insert(cleaned);
      if (error) throw error;
      log.textContent += `\n✓ Done.`;
      toast(`Imported ${cleaned.length} rows`);
    } catch (e) {
      log.textContent += `\n✗ ${e.message}`;
      toast('Import failed — see details', 'error');
    }
  };

  // ----- export -----
  $('#export').onclick = async () => {
    const log = $('#backup-log');
    log.textContent = 'Reading every table…';
    const supabase = db();
    const out = { exported_at: new Date().toISOString(), version: 1, data: {} };
    for (const t of TABLES) {
      const { data, error } = await supabase.from(t).select('*');
      if (error) { log.textContent = `✗ ${t}: ${error.message}`; return; }
      out.data[t] = data;
      log.textContent += `\n${t}: ${data.length} rows`;
    }
    download(JSON.stringify(out, null, 2),
            `bizmanager-backup-${new Date().toISOString().slice(0,10)}.json`,
            'application/json');
    log.textContent += `\n✓ Backup downloaded.`;
  };

  // ----- admin: list / promote / demote users -----
  if (isAdmin) loadUsers(target, me);

  // ----- restore -----
  $('#restore').onchange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (!await confirm('Restoring will INSERT all rows from the file into your database. Continue?')) return;
    const log = $('#backup-log');
    log.textContent = `Reading ${file.name}…`;
    try {
      const obj = JSON.parse(await file.text());
      if (!obj.data) throw new Error('Not a backup file (missing "data").');
      const supabase = db();
      for (const t of TABLES) {
        const rows = obj.data[t] || [];
        if (rows.length === 0) { log.textContent += `\n${t}: skipped (empty)`; continue; }
        // strip ids so Supabase auto-assigns new ones — keeps things simple
        const { error } = await supabase.from(t).insert(rows.map(({ id, ...rest }) => rest));
        if (error) { log.textContent += `\n✗ ${t}: ${error.message}`; return; }
        log.textContent += `\n${t}: inserted ${rows.length}`;
      }
      log.textContent += `\n✓ Restore done.`;
      toast('Restore complete');
    } catch (err) {
      log.textContent += `\n✗ ${err.message}`;
    } finally {
      e.target.value = '';
    }
  };
}

async function loadUsers(target, me) {
  const list = target.querySelector('#users-list');
  if (!list) return;
  const supabase = db();
  const { data: users = [], error } = await supabase
    .from('profiles')
    .select('id, email, full_name, role, created_at')
    .order('created_at');
  if (error) { list.textContent = error.message; return; }
  list.innerHTML = `
    <table class="tbl">
      <thead><tr><th>Email</th><th>Name</th><th>Role</th><th></th></tr></thead>
      <tbody>
        ${users.map((u) => `
          <tr>
            <td>${esc(u.email)}</td>
            <td>${esc(u.full_name || '—')}</td>
            <td>
              <span class="px-2 py-1 text-xs rounded-full
                ${u.role === 'admin'
                  ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200'
                  : 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-200'}">${esc(u.role)}</span>
            </td>
            <td class="text-right">
              ${u.id === me.user.id
                ? '<span class="text-xs text-slate-500">you</span>'
                : `<button class="btn btn-ghost ${u.role === 'admin' ? 'text-blue-600' : 'text-amber-600'}"
                        data-toggle-role="${u.id}" data-current="${u.role}">
                     ${u.role === 'admin' ? 'Demote to customer' : 'Promote to admin'}
                   </button>`}
            </td>
          </tr>`).join('')}
      </tbody>
    </table>`;
  list.querySelectorAll('[data-toggle-role]').forEach((b) => {
    b.onclick = async () => {
      const newRole = b.dataset.current === 'admin' ? 'customer' : 'admin';
      if (!await confirm(`Change this user's role to "${newRole}"?`)) return;
      const { error } = await db().from('profiles')
        .update({ role: newRole })
        .eq('id', b.dataset.toggleRole);
      if (error) return toast(error.message, 'error');
      toast('Role updated');
      loadUsers(target, me);
    };
  });
}

function openReconnect(target) {
  openModal({
    title: 'Change database connection',
    bodyHtml: `
      <form id="f" class="space-y-3">
        <div><label class="text-sm">Supabase URL</label>
             <input class="field" name="url" required placeholder="https://xxxxx.supabase.co"></div>
        <div><label class="text-sm">Anon key</label>
             <input class="field" name="key" required type="password"></div>
        <div id="msg" class="text-sm hidden"></div>
        <div class="text-right pt-2">
          <button type="button" class="btn btn-ghost" data-modal-close>Cancel</button>
          <button class="btn btn-primary">Test &amp; save</button>
        </div>
      </form>
    `,
    onMount(body, close) {
      body.querySelector('#f').onsubmit = async (e) => {
        e.preventDefault();
        const fd = Object.fromEntries(new FormData(e.target));
        const msg = body.querySelector('#msg');
        msg.classList.remove('hidden');
        msg.className = 'text-sm p-3 rounded-lg bg-slate-100 dark:bg-slate-700';
        msg.textContent = 'Testing…';
        const r = await testConnection(fd.url.trim(), fd.key.trim());
        if (!r.ok) { msg.className += ' text-red-700'; msg.textContent = r.message; return; }
        setCreds({ url: fd.url.trim(), key: fd.key.trim() });
        toast('Connected');
        close();
        renderSettings(target);
      };
    },
  });
}

// ----- helpers -----

function download(text, filename, mime) {
  const blob = new Blob([text], { type: mime });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}

/** Minimal CSV parser. Handles quoted fields with commas / quotes / newlines. */
function parseCsv(text) {
  const rows = [];
  let row = [], cell = '', inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') { cell += '"'; i++; }
        else inQuotes = false;
      } else cell += ch;
    } else {
      if (ch === '"') inQuotes = true;
      else if (ch === ',') { row.push(cell); cell = ''; }
      else if (ch === '\n' || ch === '\r') {
        if (cell !== '' || row.length) { row.push(cell); rows.push(row); row = []; cell = ''; }
        if (ch === '\r' && text[i + 1] === '\n') i++;
      } else cell += ch;
    }
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
  if (rows.length < 2) return [];
  const headers = rows[0].map((h) => h.trim());
  return rows.slice(1).filter((r) => r.some((v) => v !== '')).map((r) =>
    Object.fromEntries(headers.map((h, i) => [h, r[i] === undefined ? '' : r[i].trim()]))
  );
}

/** Numeric / id columns get coerced to numbers so Supabase accepts them. */
function coerceRow(table, row) {
  const numeric = {
    customers: [],
    customer_transactions: ['customer_id', 'amount'],
    expenses: ['amount'],
    loans: ['principal', 'interest_rate', 'duration_months'],
    loan_transactions: ['loan_id', 'amount'],
    chits: ['total_value', 'members_count', 'duration_months'],
    chit_members: ['chit_id'],
    chit_transactions: ['member_id', 'amount'],
  };
  const out = { ...row };
  (numeric[table] || []).forEach((k) => {
    if (out[k] !== undefined && out[k] !== '') out[k] = Number(out[k]);
    if (out[k] === '') delete out[k];
  });
  // Drop blanks so defaults kick in
  Object.keys(out).forEach((k) => { if (out[k] === '') delete out[k]; });
  return out;
}
