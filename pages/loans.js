// Loans — list + add + record payments.

import { db } from '../db.js';
import { mount, esc, inr, fmtDate, today, toast, openModal, confirm } from '../ui.js';

export async function renderLoans(target) {
  await draw(target);
}

async function draw(target, search = '') {
  mount(target, `<div class="text-slate-500">Loading…</div>`);
  const supabase = db();

  const [{ data: loans = [] }, { data: txs = [] }] = await Promise.all([
    supabase.from('loans').select('*').order('name'),
    supabase.from('loan_transactions').select('*'),
  ]);

  const enriched = loans.map((l) => {
    const paid = txs.filter((t) => t.loan_id === l.id && t.type === 'Payment')
                   .reduce((s, t) => s + Number(t.amount), 0);
    return { ...l, paid, balance: Number(l.principal) - paid };
  });

  const filtered = search
    ? enriched.filter((l) => l.name.toLowerCase().includes(search.toLowerCase()))
    : enriched;

  const totalPrincipal = enriched.reduce((s, l) => s + Number(l.principal), 0);
  const totalPaid      = enriched.reduce((s, l) => s + l.paid, 0);

  mount(target, `
    <h1 class="text-3xl font-bold mb-6">Loans</h1>

    <div class="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
      <div class="card"><div class="text-sm text-slate-500">Loans</div><div class="text-2xl font-bold">${enriched.length}</div></div>
      <div class="card"><div class="text-sm text-slate-500">Paid so far</div><div class="text-2xl font-bold text-green-600">${inr(totalPaid)}</div></div>
      <div class="card"><div class="text-sm text-slate-500">Outstanding</div><div class="text-2xl font-bold text-red-600">${inr(totalPrincipal - totalPaid)}</div></div>
    </div>

    <div class="card">
      <div class="flex flex-col md:flex-row md:items-center justify-between gap-3 mb-4">
        <input id="search" placeholder="Search loan name…" class="field md:max-w-sm" value="${esc(search)}" />
        <button id="add" class="btn btn-primary">+ New loan</button>
      </div>

      <div class="overflow-x-auto">
        <table class="tbl">
          <thead><tr>
            <th>Name</th><th>Type</th><th>Principal</th><th>Paid</th><th>Balance</th><th>Status</th><th></th>
          </tr></thead>
          <tbody>
            ${filtered.length === 0
              ? `<tr><td colspan="7" class="text-center text-slate-500 py-8">No loans yet.</td></tr>`
              : filtered.map((l) => `
                <tr>
                  <td class="font-medium">${esc(l.name)}</td>
                  <td><span class="px-2 py-1 text-xs rounded-full bg-indigo-100 text-indigo-800 dark:bg-indigo-900/40 dark:text-indigo-200">${esc(l.type)}</span></td>
                  <td>${inr(l.principal)}</td>
                  <td class="text-green-600">${inr(l.paid)}</td>
                  <td class="font-semibold">${inr(l.balance)}</td>
                  <td>
                    <span class="px-2 py-1 text-xs rounded-full
                      ${l.status === 'Active'
                         ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200'
                         : 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-200'}">${esc(l.status)}</span>
                  </td>
                  <td class="text-right whitespace-nowrap">
                    <button class="btn btn-ghost text-blue-600" data-pay="${l.id}">+ Pay</button>
                    <button class="btn btn-ghost text-blue-600" data-tx="${l.id}">Tx</button>
                    <button class="btn btn-ghost"             data-edit="${l.id}">✏️</button>
                    <button class="btn btn-ghost text-red-600" data-del="${l.id}">🗑</button>
                  </td>
                </tr>`).join('')}
          </tbody>
        </table>
      </div>
    </div>
  `);

  const $ = (s) => target.querySelector(s);
  $('#search').oninput = (e) => draw(target, e.target.value);
  $('#add').onclick = () => openLoanForm(target);

  target.querySelectorAll('[data-pay]').forEach((b) =>
    b.onclick = () => openPayForm(target, enriched.find((x) => x.id == b.dataset.pay)));
  target.querySelectorAll('[data-tx]').forEach((b) =>
    b.onclick = () => openTxList(target, enriched.find((x) => x.id == b.dataset.tx)));
  target.querySelectorAll('[data-edit]').forEach((b) =>
    b.onclick = () => openLoanForm(target, enriched.find((x) => x.id == b.dataset.edit)));
  target.querySelectorAll('[data-del]').forEach((b) => {
    b.onclick = async () => {
      if (!await confirm('Delete this loan and ALL its transactions?')) return;
      await supabase.from('loan_transactions').delete().eq('loan_id', b.dataset.del);
      const { error } = await supabase.from('loans').delete().eq('id', b.dataset.del);
      if (error) return toast(error.message, 'error');
      toast('Loan deleted');
      draw(target, search);
    };
  });
}

function openLoanForm(target, existing) {
  const isEdit = !!existing;
  openModal({
    title: isEdit ? `Edit ${existing.name}` : 'New loan',
    bodyHtml: `
      <form id="f" class="space-y-3">
        <div><label class="text-sm">Loan name</label>
             <input class="field" name="name" required value="${esc(existing?.name || '')}" placeholder="Personal loan, John, etc."></div>
        <div><label class="text-sm">Principal (₹)</label>
             <input class="field" type="number" step="0.01" name="principal" required value="${esc(existing?.principal || '')}"></div>
        <div><label class="text-sm">Type</label>
             <select class="field" name="type" ${isEdit ? 'disabled' : ''}>
               <option ${existing?.type === 'Taken' || !isEdit ? 'selected' : ''}>Taken</option>
               <option ${existing?.type === 'Given' ? 'selected' : ''}>Given</option>
             </select></div>
        <div class="grid grid-cols-2 gap-3">
          <div><label class="text-sm">Interest %</label>
               <input class="field" type="number" step="0.01" name="interest_rate" value="${esc(existing?.interest_rate || 0)}"></div>
          <div><label class="text-sm">Months</label>
               <input class="field" type="number" name="duration_months" value="${esc(existing?.duration_months || 0)}"></div>
        </div>
        <div><label class="text-sm">Status</label>
             <select class="field" name="status">
               <option ${existing?.status === 'Active' || !isEdit ? 'selected' : ''}>Active</option>
               <option ${existing?.status === 'Paid Off' ? 'selected' : ''}>Paid Off</option>
             </select></div>
        <div class="text-right pt-2">
          <button type="button" class="btn btn-ghost" data-modal-close>Cancel</button>
          <button class="btn btn-primary">${isEdit ? 'Save changes' : 'Create loan'}</button>
        </div>
      </form>
    `,
    onMount(body, close) {
      body.querySelector('#f').onsubmit = async (e) => {
        e.preventDefault();
        const fd = Object.fromEntries(new FormData(e.target));
        fd.principal       = Number(fd.principal);
        fd.interest_rate   = Number(fd.interest_rate || 0);
        fd.duration_months = parseInt(fd.duration_months || 0, 10);
        if (isEdit) {
          const { error } = await db().from('loans').update(fd).eq('id', existing.id);
          if (error) return toast(error.message, 'error');
        } else {
          const { data, error } = await db().from('loans').insert([fd]).select();
          if (error) return toast(error.message, 'error');
          // record the original disbursement so totals make sense
          await db().from('loan_transactions').insert([{
            loan_id: data[0].id,
            date: today(),
            amount: fd.principal,
            description: 'Loan disbursement',
            type: 'Disbursement'
          }]);
        }
        toast(isEdit ? 'Saved' : 'Loan created');
        close();
        draw(target);
      };
    },
  });
}

function openPayForm(target, loan) {
  openModal({
    title: `Add payment — ${loan.name}`,
    bodyHtml: `
      <form id="f" class="space-y-3">
        <div><label class="text-sm">Date</label>
             <input class="field" type="date" name="date" required value="${today()}"></div>
        <div><label class="text-sm">Amount (₹)</label>
             <input class="field" type="number" step="0.01" name="amount" required></div>
        <div><label class="text-sm">Description</label>
             <input class="field" name="description" placeholder="e.g. EMI April"></div>
        <div class="text-right pt-2">
          <button type="button" class="btn btn-ghost" data-modal-close>Cancel</button>
          <button class="btn btn-primary">Save payment</button>
        </div>
      </form>
    `,
    onMount(body, close) {
      body.querySelector('#f').onsubmit = async (e) => {
        e.preventDefault();
        const fd = Object.fromEntries(new FormData(e.target));
        fd.amount = Number(fd.amount);
        fd.loan_id = loan.id;
        fd.type = 'Payment';
        const { error } = await db().from('loan_transactions').insert([fd]);
        if (error) return toast(error.message, 'error');
        toast('Payment recorded');
        close();
        draw(target);
      };
    },
  });
}

async function openTxList(target, loan) {
  const supabase = db();
  const { data: rows = [] } = await supabase
    .from('loan_transactions')
    .select('*')
    .eq('loan_id', loan.id)
    .order('date', { ascending: false });

  openModal({
    title: `Transactions — ${loan.name}`,
    bodyHtml: rows.length === 0
      ? '<p class="text-sm text-slate-500">No transactions yet.</p>'
      : `<ul class="space-y-2 max-h-80 overflow-y-auto">
           ${rows.map((t) => `
             <li class="flex justify-between p-2 rounded border border-slate-200 dark:border-slate-700">
               <div>
                 <div class="text-sm font-medium">${esc(t.description || t.type)}</div>
                 <div class="text-xs text-slate-500">${fmtDate(t.date)} · ${esc(t.type)}</div>
               </div>
               <div class="font-semibold ${t.type === 'Disbursement' ? 'text-red-600' : 'text-green-600'}">
                 ${t.type === 'Disbursement' ? '-' : '+'}${esc(inr(t.amount))}
               </div>
             </li>`).join('')}
         </ul>`,
  });
}
