// Expenses — household expenses + income.

import { db } from '../db.js';
import { mount, esc, inr, fmtDate, today, toast, openModal, confirm } from '../ui.js';

export async function renderExpenses(target) {
  await draw(target);
}

async function draw(target, search = '') {
  mount(target, `<div class="text-slate-500">Loading…</div>`);
  const supabase = db();
  const { data: rows = [] } = await supabase
    .from('expenses').select('*').order('expense_date', { ascending: false });

  const filtered = search
    ? rows.filter((r) =>
        (r.description || '').toLowerCase().includes(search.toLowerCase()) ||
        (r.category    || '').toLowerCase().includes(search.toLowerCase()))
    : rows;

  const income  = rows.filter((r) => r.type === 'Income') .reduce((s, r) => s + Number(r.amount), 0);
  const expense = rows.filter((r) => r.type === 'Expense').reduce((s, r) => s + Number(r.amount), 0);

  mount(target, `
    <h1 class="text-3xl font-bold mb-1">Household Expenses</h1>
    <p class="text-slate-500 mb-6">Personal income and spending — kept separate from the business books.</p>

    <div class="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
      <div class="card"><div class="text-sm text-slate-500">Total income</div><div class="text-2xl font-bold text-green-600">${inr(income)}</div></div>
      <div class="card"><div class="text-sm text-slate-500">Total expense</div><div class="text-2xl font-bold text-red-600">${inr(expense)}</div></div>
      <div class="card"><div class="text-sm text-slate-500">Net</div><div class="text-2xl font-bold">${inr(income - expense)}</div></div>
    </div>

    <div class="card">
      <div class="flex flex-col md:flex-row md:items-center justify-between gap-3 mb-4">
        <input id="search" placeholder="Search description or category…" class="field md:max-w-sm" value="${esc(search)}" />
        <button id="add" class="btn btn-primary">+ Add entry</button>
      </div>

      <div class="overflow-x-auto">
        <table class="tbl">
          <thead><tr>
            <th>Date</th><th>Description</th><th>Category</th><th>Amount</th><th>Type</th><th></th>
          </tr></thead>
          <tbody>
            ${filtered.length === 0
              ? `<tr><td colspan="6" class="text-center text-slate-500 py-8">No entries yet.</td></tr>`
              : filtered.map((r) => `
                <tr>
                  <td>${fmtDate(r.expense_date)}</td>
                  <td class="font-medium">${esc(r.description)}</td>
                  <td>${esc(r.category || '—')}</td>
                  <td class="font-semibold ${r.type === 'Income' ? 'text-green-600' : 'text-red-600'}">${inr(r.amount)}</td>
                  <td>
                    <span class="px-2 py-1 text-xs rounded-full
                      ${r.type === 'Income'
                        ? 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-200'
                        : 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200'}">
                      ${esc(r.type)}
                    </span>
                  </td>
                  <td class="text-right whitespace-nowrap">
                    <button class="btn btn-ghost"             data-edit="${r.id}">✏️</button>
                    <button class="btn btn-ghost text-red-600" data-del="${r.id}">🗑</button>
                  </td>
                </tr>`).join('')}
          </tbody>
        </table>
      </div>
    </div>
  `);

  const $ = (s) => target.querySelector(s);
  $('#search').oninput = (e) => draw(target, e.target.value);
  $('#add').onclick = () => openForm(target);

  target.querySelectorAll('[data-edit]').forEach((b) => {
    b.onclick = () => {
      const r = rows.find((x) => x.id == b.dataset.edit);
      openForm(target, r);
    };
  });
  target.querySelectorAll('[data-del]').forEach((b) => {
    b.onclick = async () => {
      if (!await confirm('Delete this entry?')) return;
      const { error } = await supabase.from('expenses').delete().eq('id', b.dataset.del);
      if (error) return toast(error.message, 'error');
      toast('Deleted');
      draw(target, search);
    };
  });
}

function openForm(target, existing) {
  const isEdit = !!existing;
  openModal({
    title: isEdit ? 'Edit entry' : 'Add entry',
    bodyHtml: `
      <form id="f" class="space-y-3">
        <div><label class="text-sm">Date</label>
             <input class="field" type="date" name="expense_date" required value="${esc(existing?.expense_date || today())}"></div>
        <div><label class="text-sm">Description</label>
             <input class="field" name="description" required value="${esc(existing?.description || '')}"></div>
        <div><label class="text-sm">Category</label>
             <input class="field" name="category" value="${esc(existing?.category || '')}" placeholder="Groceries, Rent, Salary…"></div>
        <div><label class="text-sm">Amount (₹)</label>
             <input class="field" type="number" step="0.01" name="amount" required value="${esc(existing?.amount || '')}"></div>
        <div><label class="text-sm">Type</label>
             <select class="field" name="type">
               <option ${existing?.type === 'Expense' || !isEdit ? 'selected' : ''}>Expense</option>
               <option ${existing?.type === 'Income' ? 'selected' : ''}>Income</option>
             </select></div>
        <div class="text-right pt-2">
          <button type="button" class="btn btn-ghost" data-modal-close>Cancel</button>
          <button class="btn btn-primary">${isEdit ? 'Save changes' : 'Add entry'}</button>
        </div>
      </form>
    `,
    onMount(body, close) {
      body.querySelector('#f').onsubmit = async (e) => {
        e.preventDefault();
        const fd = Object.fromEntries(new FormData(e.target));
        fd.amount = Number(fd.amount);
        const { error } = isEdit
          ? await db().from('expenses').update(fd).eq('id', existing.id)
          : await db().from('expenses').insert([fd]);
        if (error) return toast(error.message, 'error');
        toast(isEdit ? 'Saved' : 'Entry added');
        close();
        draw(target);
      };
    },
  });
}
