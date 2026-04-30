// Chits — list of chit groups (Mom's view).
//
// Each chit row drills into pages/chit-details.js by setting #/chits/<id>.

import { db } from '../db.js';
import { mount, esc, inr, toast, openModal, confirm } from '../ui.js';

export async function renderChits(target, ctx) {
  await draw(target, ctx);
}

async function draw(target, ctx, search = '') {
  mount(target, `<div class="text-slate-500">Loading chits…</div>`);
  const supabase = db();

  // We pull every chit + every chit_member + every chit_transaction so that the
  // little summary on each row (collected / given) is accurate.
  const [{ data: chits = [] }, { data: members = [] }, { data: txs = [] }] = await Promise.all([
    supabase.from('chits').select('*').order('created_at', { ascending: false }),
    supabase.from('chit_members').select('id, chit_id'),
    supabase.from('chit_transactions').select('member_id, amount, type'),
  ]);

  // chitId -> { collected, given, members }
  const memberById = Object.fromEntries(members.map((m) => [m.id, m]));
  const stats = {};
  for (const t of txs) {
    const m = memberById[t.member_id];
    if (!m) continue;
    stats[m.chit_id] ??= { collected: 0, given: 0 };
    if (t.type === 'Given')    stats[m.chit_id].collected += Number(t.amount);
    if (t.type === 'Received') stats[m.chit_id].given     += Number(t.amount);
  }

  const enriched = chits.map((c) => ({
    ...c,
    member_count: members.filter((m) => m.chit_id === c.id).length,
    collected:    stats[c.id]?.collected || 0,
    given:        stats[c.id]?.given     || 0,
  }));

  const filtered = search
    ? enriched.filter((c) => c.name.toLowerCase().includes(search.toLowerCase()))
    : enriched;

  const totalCollected = enriched.reduce((s, c) => s + c.collected, 0);
  const totalGiven     = enriched.reduce((s, c) => s + c.given, 0);
  const ongoing        = enriched.filter((c) => c.status === 'Ongoing').length;

  mount(target, `
    <h1 class="text-3xl font-bold mb-2">Chits</h1>
    <p class="text-slate-500 mb-6">Each chit is a group of people who pay in monthly. One member wins the lottery each month.</p>

    <div class="grid grid-cols-1 sm:grid-cols-4 gap-4 mb-6">
      <div class="card"><div class="text-sm text-slate-500">Active chits</div><div class="text-2xl font-bold">${ongoing}</div></div>
      <div class="card"><div class="text-sm text-slate-500">Members</div><div class="text-2xl font-bold">${members.length}</div></div>
      <div class="card"><div class="text-sm text-slate-500">Collected</div><div class="text-2xl font-bold text-green-600">${inr(totalCollected)}</div></div>
      <div class="card"><div class="text-sm text-slate-500">Given out</div><div class="text-2xl font-bold text-red-600">${inr(totalGiven)}</div></div>
    </div>

    <div class="card">
      <div class="flex flex-col md:flex-row md:items-center justify-between gap-3 mb-4">
        <input id="search" placeholder="Search chit name…" class="field md:max-w-sm" value="${esc(search)}">
        <button id="add" class="btn btn-primary">+ New chit</button>
      </div>

      <div class="overflow-x-auto">
        <table class="tbl">
          <thead><tr>
            <th>Name</th><th>Value</th><th>Members</th><th>Months</th>
            <th>Collected</th><th>Given</th><th>Savings</th><th>Status</th><th></th>
          </tr></thead>
          <tbody>
            ${filtered.length === 0
              ? `<tr><td colspan="9" class="text-center text-slate-500 py-8">No chits yet. Click "New chit" to start.</td></tr>`
              : filtered.map((c) => `
                <tr>
                  <td class="font-medium"><a href="#/chits/${c.id}" class="text-primary hover:underline">${esc(c.name)}</a></td>
                  <td>${inr(c.total_value)}</td>
                  <td>${c.member_count} / ${c.members_count}</td>
                  <td>${esc(c.duration_months)}</td>
                  <td class="text-green-600">${inr(c.collected)}</td>
                  <td class="text-red-600">${inr(c.given)}</td>
                  <td class="font-semibold">${inr(c.collected - c.given)}</td>
                  <td>
                    <span class="px-2 py-1 text-xs rounded-full ${c.status === 'Ongoing'
                      ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200'
                      : 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-200'}">
                      ${esc(c.status)}
                    </span>
                  </td>
                  <td class="text-right whitespace-nowrap">
                    <a href="#/chits/${c.id}" class="btn btn-ghost text-blue-600">Open</a>
                    <button class="btn btn-ghost"             data-edit="${c.id}">✏️</button>
                    <button class="btn btn-ghost text-red-600" data-del="${c.id}">🗑</button>
                  </td>
                </tr>`).join('')}
          </tbody>
        </table>
      </div>
    </div>
  `);

  const $ = (s) => target.querySelector(s);
  $('#search').oninput = (e) => draw(target, ctx, e.target.value);
  $('#add').onclick = () => openChitForm(target, ctx);

  target.querySelectorAll('[data-edit]').forEach((b) =>
    b.onclick = () => openChitForm(target, ctx, enriched.find((x) => x.id == b.dataset.edit)));

  target.querySelectorAll('[data-del]').forEach((b) => {
    b.onclick = async () => {
      if (!await confirm('Delete this chit, ALL its members and ALL their transactions?')) return;
      // chit_members has cascade on chit, chit_transactions has cascade on member,
      // so a single delete on chits is enough.
      const { error } = await supabase.from('chits').delete().eq('id', b.dataset.del);
      if (error) return toast(error.message, 'error');
      toast('Chit deleted');
      draw(target, ctx, search);
    };
  });
}

function openChitForm(target, ctx, existing) {
  const isEdit = !!existing;
  openModal({
    title: isEdit ? `Edit ${existing.name}` : 'New chit',
    bodyHtml: `
      <form id="f" class="space-y-3">
        <div><label class="text-sm">Chit name</label>
             <input class="field" name="name" required value="${esc(existing?.name || '')}" placeholder="e.g. Lakshmi Monthly Group"></div>
        <div class="grid grid-cols-2 gap-3">
          <div><label class="text-sm">Total value (₹)</label>
               <input class="field" type="number" step="0.01" name="total_value" required value="${esc(existing?.total_value || '')}"></div>
          <div><label class="text-sm">Members</label>
               <input class="field" type="number" name="members_count" required value="${esc(existing?.members_count || '')}"></div>
        </div>
        <div><label class="text-sm">Duration (months)</label>
             <input class="field" type="number" name="duration_months" required value="${esc(existing?.duration_months || '')}"></div>
        <div><label class="text-sm">Status</label>
             <select class="field" name="status">
               <option ${existing?.status === 'Ongoing' || !isEdit ? 'selected' : ''}>Ongoing</option>
               <option ${existing?.status === 'Completed' ? 'selected' : ''}>Completed</option>
             </select></div>
        <div class="text-right pt-2">
          <button type="button" class="btn btn-ghost" data-modal-close>Cancel</button>
          <button class="btn btn-primary">${isEdit ? 'Save changes' : 'Create chit'}</button>
        </div>
      </form>
    `,
    onMount(body, close) {
      body.querySelector('#f').onsubmit = async (e) => {
        e.preventDefault();
        const fd = Object.fromEntries(new FormData(e.target));
        fd.total_value     = Number(fd.total_value);
        fd.members_count   = parseInt(fd.members_count, 10);
        fd.duration_months = parseInt(fd.duration_months, 10);
        const supabase = db();
        const { error } = isEdit
          ? await supabase.from('chits').update(fd).eq('id', existing.id)
          : await supabase.from('chits').insert([fd]);
        if (error) return toast(error.message, 'error');
        toast(isEdit ? 'Saved' : 'Chit created');
        close();
        draw(target, ctx);
      };
    },
  });
}
