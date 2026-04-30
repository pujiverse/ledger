// Chit details — members list, monthly contributions, lucky draw.
//
// URL: #/chits/<id>

import { db } from '../db.js';
import { mount, esc, inr, fmtDate, today, toast, openModal, confirm } from '../ui.js';

export async function renderChitDetails(target, ctx) {
  const chitId = ctx.params.id;
  await draw(target, ctx, chitId);
}

async function draw(target, ctx, chitId) {
  mount(target, `<div class="text-slate-500">Loading chit…</div>`);
  const supabase = db();

  const [{ data: chit, error: chitErr },
         { data: members = [] },
         { data: txs = [] }] = await Promise.all([
    supabase.from('chits').select('*').eq('id', chitId).maybeSingle(),
    supabase.from('chit_members').select('*').eq('chit_id', chitId).order('name'),
    supabase.from('chit_transactions').select('*'),
  ]);

  if (chitErr || !chit) {
    mount(target, `
      <a href="#/chits" class="text-primary hover:underline">← Back to chits</a>
      <div class="card mt-4 text-red-600">Chit not found.</div>`);
    return;
  }

  // attach totals to each member
  const enriched = members.map((m) => {
    const ms = txs.filter((t) => t.member_id === m.id);
    const given    = ms.filter((t) => t.type === 'Given').reduce((s, t) => s + Number(t.amount), 0);
    const received = ms.filter((t) => t.type === 'Received').reduce((s, t) => s + Number(t.amount), 0);
    const lastTx   = ms.map((t) => t.date).sort().pop();
    return { ...m, given, received, lastTx };
  });

  const collected = enriched.reduce((s, m) => s + m.given, 0);
  const givenOut  = enriched.reduce((s, m) => s + m.received, 0);
  const eligible  = enriched.filter((m) => m.lottery_status === 'Pending');

  mount(target, `
    <a href="#/chits" class="text-primary hover:underline">← Back to chits</a>

    <div class="flex items-start justify-between flex-wrap gap-3 mt-3 mb-6">
      <div>
        <h1 class="text-3xl font-bold">${esc(chit.name)}</h1>
        <p class="text-slate-500">
          ₹${Number(chit.total_value).toLocaleString('en-IN')} ·
          ${chit.members_count} members planned ·
          ${chit.duration_months} months ·
          <span class="${chit.status === 'Ongoing' ? 'text-amber-600' : 'text-green-600'}">${esc(chit.status)}</span>
        </p>
      </div>
      <button id="lottery"
              class="btn btn-primary text-base px-5"
              ${eligible.length < 2 ? 'disabled' : ''}
              title="${eligible.length < 2 ? 'Need at least 2 pending members' : `Run this month's lucky draw`}">
        🎲 Run lucky draw
      </button>
    </div>

    <div class="grid grid-cols-1 sm:grid-cols-4 gap-4 mb-6">
      <div class="card"><div class="text-sm text-slate-500">Members joined</div><div class="text-2xl font-bold">${members.length}</div></div>
      <div class="card"><div class="text-sm text-slate-500">Pending in draw</div><div class="text-2xl font-bold">${eligible.length}</div></div>
      <div class="card"><div class="text-sm text-slate-500">Collected</div><div class="text-2xl font-bold text-green-600">${inr(collected)}</div></div>
      <div class="card"><div class="text-sm text-slate-500">Given out</div><div class="text-2xl font-bold text-red-600">${inr(givenOut)}</div></div>
    </div>

    <div class="card">
      <div class="flex flex-col md:flex-row md:items-center justify-between gap-3 mb-4">
        <h2 class="text-xl font-semibold">Members</h2>
        <button id="addMember" class="btn btn-primary">+ Add member</button>
      </div>

      <div class="overflow-x-auto">
        <table class="tbl">
          <thead><tr>
            <th>Name</th><th>Phone</th><th>Given</th><th>Received</th>
            <th>Last activity</th><th>Lottery</th><th></th>
          </tr></thead>
          <tbody>
            ${enriched.length === 0
              ? `<tr><td colspan="7" class="text-center text-slate-500 py-8">No members yet. Add the people in this chit group.</td></tr>`
              : enriched.map((m) => `
                <tr>
                  <td class="font-medium">${esc(m.name)}</td>
                  <td>${esc(m.phone || '—')}</td>
                  <td class="text-green-600">${inr(m.given)}</td>
                  <td class="text-red-600">${inr(m.received)}</td>
                  <td class="text-sm">${m.lastTx ? fmtDate(m.lastTx) : '—'}</td>
                  <td>
                    <span class="px-2 py-1 text-xs rounded-full
                      ${m.lottery_status === 'Won'
                        ? 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-200'
                        : 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200'}">
                      ${esc(m.lottery_status)}
                    </span>
                  </td>
                  <td class="text-right whitespace-nowrap">
                    <button class="btn btn-ghost text-blue-600" data-pay="${m.id}">+ Payment</button>
                    <button class="btn btn-ghost text-blue-600" data-tx="${m.id}">Tx</button>
                    <button class="btn btn-ghost"             data-edit="${m.id}">✏️</button>
                    <button class="btn btn-ghost text-red-600" data-del="${m.id}">🗑</button>
                  </td>
                </tr>`).join('')}
          </tbody>
        </table>
      </div>
    </div>
  `);

  const $ = (s) => target.querySelector(s);
  $('#addMember').onclick = () => openMemberForm(target, ctx, chitId);
  $('#lottery').onclick = () => openLottery(target, ctx, chit, eligible);

  target.querySelectorAll('[data-edit]').forEach((b) =>
    b.onclick = () => openMemberForm(target, ctx, chitId, enriched.find((x) => x.id == b.dataset.edit)));

  target.querySelectorAll('[data-pay]').forEach((b) =>
    b.onclick = () => openContributionForm(target, ctx, chitId, enriched.find((x) => x.id == b.dataset.pay)));

  target.querySelectorAll('[data-tx]').forEach((b) =>
    b.onclick = () => openMemberTxList(target, ctx, chitId, enriched.find((x) => x.id == b.dataset.tx)));

  target.querySelectorAll('[data-del]').forEach((b) => {
    b.onclick = async () => {
      if (!await confirm('Remove this member and all their transactions?')) return;
      const { error } = await supabase.from('chit_members').delete().eq('id', b.dataset.del);
      if (error) return toast(error.message, 'error');
      toast('Member removed');
      draw(target, ctx, chitId);
    };
  });
}

// ---------------------------------------------------------------
// Member CRUD + transactions
// ---------------------------------------------------------------

function openMemberForm(target, ctx, chitId, existing) {
  const isEdit = !!existing;
  openModal({
    title: isEdit ? `Edit ${existing.name}` : 'Add member',
    bodyHtml: `
      <form id="f" class="space-y-3">
        <div><label class="text-sm">Name</label>
             <input class="field" name="name" required value="${esc(existing?.name || '')}"></div>
        <div class="grid grid-cols-2 gap-3">
          <div><label class="text-sm">Phone</label>
               <input class="field" name="phone" value="${esc(existing?.phone || '')}"></div>
          <div><label class="text-sm">Email</label>
               <input class="field" type="email" name="email" value="${esc(existing?.email || '')}"></div>
        </div>
        <div><label class="text-sm">Address</label>
             <textarea class="field" name="address">${esc(existing?.address || '')}</textarea></div>
        <div><label class="text-sm">Lottery status</label>
             <select class="field" name="lottery_status">
               <option ${existing?.lottery_status === 'Pending' || !isEdit ? 'selected' : ''}>Pending</option>
               <option ${existing?.lottery_status === 'Won' ? 'selected' : ''}>Won</option>
             </select></div>
        <div class="text-right pt-2">
          <button type="button" class="btn btn-ghost" data-modal-close>Cancel</button>
          <button class="btn btn-primary">${isEdit ? 'Save changes' : 'Add member'}</button>
        </div>
      </form>
    `,
    onMount(body, close) {
      body.querySelector('#f').onsubmit = async (e) => {
        e.preventDefault();
        const fd = Object.fromEntries(new FormData(e.target));
        fd.chit_id = Number(chitId);
        const supabase = db();
        const { error } = isEdit
          ? await supabase.from('chit_members').update(fd).eq('id', existing.id)
          : await supabase.from('chit_members').insert([fd]);
        if (error) return toast(error.message, 'error');
        toast(isEdit ? 'Saved' : 'Member added');
        close();
        draw(target, ctx, chitId);
      };
    },
  });
}

function openContributionForm(target, ctx, chitId, member) {
  openModal({
    title: `Record payment — ${member.name}`,
    bodyHtml: `
      <form id="f" class="space-y-3">
        <div><label class="text-sm">Date</label>
             <input class="field" type="date" name="date" required value="${today()}"></div>
        <div><label class="text-sm">Amount (₹)</label>
             <input class="field" type="number" step="0.01" name="amount" required></div>
        <div><label class="text-sm">Description</label>
             <input class="field" name="description" placeholder="e.g. Monthly contribution"></div>
        <div><label class="text-sm">Type</label>
             <select class="field" name="type">
               <option value="Given">Given (member paid in)</option>
               <option value="Received">Received (member took prize)</option>
             </select></div>
        <div class="text-right pt-2">
          <button type="button" class="btn btn-ghost" data-modal-close>Cancel</button>
          <button class="btn btn-primary">Save</button>
        </div>
      </form>
    `,
    onMount(body, close) {
      body.querySelector('#f').onsubmit = async (e) => {
        e.preventDefault();
        const fd = Object.fromEntries(new FormData(e.target));
        fd.amount = Number(fd.amount);
        fd.member_id = member.id;
        const { error } = await db().from('chit_transactions').insert([fd]);
        if (error) return toast(error.message, 'error');
        toast('Payment recorded');
        close();
        draw(target, ctx, chitId);
      };
    },
  });
}

async function openMemberTxList(target, ctx, chitId, member) {
  const { data: rows = [] } = await db()
    .from('chit_transactions')
    .select('*')
    .eq('member_id', member.id)
    .order('date', { ascending: false });

  openModal({
    title: `Transactions — ${member.name}`,
    bodyHtml: rows.length === 0
      ? '<p class="text-sm text-slate-500">No transactions yet.</p>'
      : `<ul class="space-y-2 max-h-80 overflow-y-auto">${rows.map((t) => `
          <li class="flex justify-between p-2 rounded border border-slate-200 dark:border-slate-700">
            <div>
              <div class="text-sm font-medium">${esc(t.description || t.type)}</div>
              <div class="text-xs text-slate-500">${fmtDate(t.date)} · ${esc(t.type)}</div>
            </div>
            <div class="font-semibold ${t.type === 'Received' ? 'text-red-600' : 'text-green-600'}">
              ${t.type === 'Received' ? '-' : '+'}${esc(inr(t.amount))}
            </div>
          </li>`).join('')}
        </ul>`,
  });
}

// ---------------------------------------------------------------
// Lucky draw
// ---------------------------------------------------------------

function openLottery(target, ctx, chit, eligibleAll) {
  // Step 1 — pick which of the pending members enter this draw.
  // Default: all of them.
  let chosen = new Set(eligibleAll.map((m) => m.id));

  openModal({
    title: `Lucky draw — ${chit.name}`,
    bodyHtml: `
      <p class="text-sm text-slate-500 mb-3">
        Only members who haven't won yet are eligible. Untick anyone who isn't paying this month.
      </p>
      <ul id="list" class="space-y-1 max-h-72 overflow-y-auto mb-3 p-2 border border-slate-200 dark:border-slate-700 rounded">
        ${eligibleAll.map((m) => `
          <li class="flex items-center gap-2 py-1">
            <input type="checkbox" class="h-4 w-4" data-cb="${m.id}" checked>
            <span>${esc(m.name)}</span>
          </li>`).join('')}
      </ul>
      <div class="flex justify-between items-center">
        <span id="count" class="text-sm text-slate-500">${eligibleAll.length} entered</span>
        <div>
          <button type="button" class="btn btn-ghost" data-modal-close>Cancel</button>
          <button id="go" class="btn btn-primary">Spin 🎲</button>
        </div>
      </div>
    `,
    onMount(body, close) {
      const count = body.querySelector('#count');
      body.querySelectorAll('[data-cb]').forEach((cb) => {
        cb.onchange = () => {
          if (cb.checked) chosen.add(Number(cb.dataset.cb));
          else            chosen.delete(Number(cb.dataset.cb));
          count.textContent = `${chosen.size} entered`;
        };
      });
      body.querySelector('#go').onclick = () => {
        if (chosen.size < 2) {
          toast('Pick at least two members', 'error');
          return;
        }
        const entrants = eligibleAll.filter((m) => chosen.has(m.id));
        close();
        spin(target, ctx, chit, entrants);
      };
    },
  });
}

function spin(target, ctx, chit, entrants) {
  // Step 2 — animate name shuffle, settle on a random winner.
  let winner = entrants[Math.floor(Math.random() * entrants.length)];

  openModal({
    title: 'Lucky draw in progress…',
    bodyHtml: `
      <div class="text-center py-8">
        <div class="text-sm text-slate-500 mb-3">Drumroll…</div>
        <div id="reel" class="text-4xl font-extrabold text-primary tracking-wide">${esc(entrants[0].name)}</div>
        <div id="prize" class="text-sm text-slate-500 mt-2">Prize: ${inr(chit.total_value)}</div>
      </div>
      <div class="flex justify-end gap-2">
        <button id="redo" class="btn btn-ghost" disabled>Spin again</button>
        <button id="confirm" class="btn btn-primary" disabled>Confirm winner</button>
      </div>
    `,
    onMount(body, close) {
      const reel = body.querySelector('#reel');
      const confirmBtn = body.querySelector('#confirm');
      const redoBtn = body.querySelector('#redo');

      let i = 0, interval = 60, elapsed = 0;
      const total = 2400; // ~2.4 seconds of shuffle
      const tick = () => {
        reel.textContent = entrants[i++ % entrants.length].name;
        elapsed += interval;
        if (elapsed < total) {
          // slow down towards the end
          interval = elapsed > total * 0.6 ? interval + 25 : interval;
          setTimeout(tick, interval);
        } else {
          reel.textContent = winner.name;
          reel.classList.add('animate-pulse');
          confirmBtn.disabled = false;
          redoBtn.disabled = false;
        }
      };
      tick();

      redoBtn.onclick = () => {
        winner = entrants[Math.floor(Math.random() * entrants.length)];
        reel.classList.remove('animate-pulse');
        i = 0; interval = 60; elapsed = 0;
        confirmBtn.disabled = true; redoBtn.disabled = true;
        tick();
      };

      confirmBtn.onclick = async () => {
        confirmBtn.disabled = true;
        const supabase = db();
        // 1. Mark winner as Won
        const { error: e1 } = await supabase.from('chit_members')
          .update({ lottery_status: 'Won' }).eq('id', winner.id);
        if (e1) return toast(e1.message, 'error');
        // 2. Record the prize transaction
        const { error: e2 } = await supabase.from('chit_transactions').insert([{
          member_id: winner.id,
          date: today(),
          amount: chit.total_value,
          type: 'Received',
          description: 'Monthly lottery prize'
        }]);
        if (e2) return toast(e2.message, 'error');

        toast(`${winner.name} won!`, 'success');
        close();
        draw(target, ctx, chit.id);
      };
    },
  });
}
