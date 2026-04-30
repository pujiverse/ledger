// Customers — list + add/edit/delete + view transactions per customer.

import { db } from '../db.js';
import { mount, esc, inr, fmtDate, today, toast, openModal, confirm } from '../ui.js';

export async function renderCustomers(target) {
  mount(target, `<div class="text-slate-500">Loading customers…</div>`);
  await draw(target);
}

async function draw(target, search = '') {
  const supabase = db();
  const [{ data: customers = [] }, { data: txs = [] }] = await Promise.all([
    supabase.from('customers').select('*').order('name'),
    supabase.from('customer_transactions').select('*'),
  ]);

  // attach totals
  const enriched = customers.map((c) => {
    const ct = txs.filter((t) => t.customer_id === c.id);
    const given    = ct.filter((t) => t.type === 'Given').reduce((s, t) => s + Number(t.amount), 0);
    const received = ct.filter((t) => t.type === 'Received').reduce((s, t) => s + Number(t.amount), 0);
    return { ...c, given, received, balance: given - received };
  });

  const filtered = search
    ? enriched.filter((c) => c.name.toLowerCase().includes(search.toLowerCase()))
    : enriched;

  const totalGiven    = enriched.reduce((s, c) => s + c.given, 0);
  const totalReceived = enriched.reduce((s, c) => s + c.received, 0);

  mount(target, `
    <h1 class="text-3xl font-bold mb-1">Daily Business</h1>
    <p class="text-slate-500 mb-6">People you give money to and receive back over many small transactions.</p>

    <div class="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
      <div class="card"><div class="text-sm text-slate-500">Total given</div><div class="text-2xl font-bold text-green-600">${inr(totalGiven)}</div></div>
      <div class="card"><div class="text-sm text-slate-500">Total received</div><div class="text-2xl font-bold text-red-600">${inr(totalReceived)}</div></div>
      <div class="card"><div class="text-sm text-slate-500">Outstanding</div><div class="text-2xl font-bold">${inr(totalGiven - totalReceived)}</div></div>
    </div>

    <div class="card">
      <div class="flex flex-col md:flex-row md:items-center justify-between gap-3 mb-4">
        <input id="search" placeholder="Search by name…" class="field md:max-w-sm" value="${esc(search)}" />
        <button id="add" class="btn btn-primary">+ Add customer</button>
      </div>

      <div class="overflow-x-auto">
        <table class="tbl">
          <thead><tr>
            <th>Name</th><th>Phone</th><th>Given</th><th>Received</th><th>Balance</th><th>Status</th><th></th>
          </tr></thead>
          <tbody>
            ${filtered.length === 0
              ? `<tr><td colspan="7" class="text-center text-slate-500 py-8">No customers yet.</td></tr>`
              : filtered.map((c) => `
                <tr>
                  <td class="font-medium">${esc(c.name)}</td>
                  <td>${esc(c.phone || '—')}</td>
                  <td class="text-green-600">${inr(c.given)}</td>
                  <td class="text-red-600">${inr(c.received)}</td>
                  <td class="font-semibold">${inr(c.balance)}</td>
                  <td>
                    <span class="px-2 py-1 text-xs rounded-full
                      ${c.status === 'Active' ? 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-200'
                                              : 'bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-200'}">
                      ${esc(c.status)}
                    </span>
                  </td>
                  <td class="whitespace-nowrap text-right">
                    <button class="btn btn-ghost text-blue-600" data-tx="${c.id}">Tx</button>
                    <button class="btn btn-ghost"             data-edit="${c.id}">✏️</button>
                    <button class="btn btn-ghost text-red-600" data-del="${c.id}">🗑</button>
                  </td>
                </tr>`).join('')}
          </tbody>
        </table>
      </div>
    </div>
  `);

  // Wiring
  const $ = (s) => target.querySelector(s);
  $('#search').oninput = (e) => draw(target, e.target.value);
  $('#add').onclick = () => openCustomerForm(target);

  target.querySelectorAll('[data-edit]').forEach((b) => {
    b.onclick = () => {
      const c = enriched.find((x) => x.id == b.dataset.edit);
      openCustomerForm(target, c);
    };
  });
  target.querySelectorAll('[data-del]').forEach((b) => {
    b.onclick = async () => {
      if (!await confirm('Delete this customer and ALL their transactions?')) return;
      await supabase.from('customer_transactions').delete().eq('customer_id', b.dataset.del);
      const { error } = await supabase.from('customers').delete().eq('id', b.dataset.del);
      if (error) return toast(error.message, 'error');
      toast('Customer deleted');
      draw(target, search);
    };
  });
  target.querySelectorAll('[data-tx]').forEach((b) => {
    b.onclick = () => {
      const c = enriched.find((x) => x.id == b.dataset.tx);
      openTxList(target, c);
    };
  });
}

function openCustomerForm(target, existing) {
  const isEdit = !!existing;
  openModal({
    title: isEdit ? `Edit ${existing.name}` : 'Add customer',
    bodyHtml: `
      <form id="f" class="space-y-3">
        <div><label class="text-sm">Name</label>
             <input class="field" name="name" required value="${esc(existing?.name || '')}"></div>
        <div><label class="text-sm">Phone</label>
             <input class="field" name="phone" value="${esc(existing?.phone || '')}"></div>
        <div><label class="text-sm">Address</label>
             <textarea class="field" name="address">${esc(existing?.address || '')}</textarea></div>
        <div><label class="text-sm">Status</label>
             <select class="field" name="status">
               <option ${existing?.status === 'Active' || !isEdit ? 'selected' : ''}>Active</option>
               <option ${existing?.status === 'Inactive' ? 'selected' : ''}>Inactive</option>
             </select></div>
        <div class="text-right pt-2">
          <button type="button" class="btn btn-ghost" data-modal-close>Cancel</button>
          <button class="btn btn-primary">${isEdit ? 'Save changes' : 'Add customer'}</button>
        </div>
      </form>
    `,
    onMount(body, close) {
      body.querySelector('#f').onsubmit = async (e) => {
        e.preventDefault();
        const fd = Object.fromEntries(new FormData(e.target));
        const supabase = db();
        const { error } = isEdit
          ? await supabase.from('customers').update(fd).eq('id', existing.id)
          : await supabase.from('customers').insert([fd]);
        if (error) return toast(error.message, 'error');
        toast(isEdit ? 'Saved' : 'Customer added');
        close();
        draw(target);
      };
    },
  });
}

async function openTxList(target, customer) {
  const supabase = db();
  const { data: rows = [] } = await supabase
    .from('customer_transactions')
    .select('*')
    .eq('customer_id', customer.id)
    .order('date', { ascending: false });

  openModal({
    title: `Transactions — ${customer.name}`,
    bodyHtml: `
      <div class="mb-3 flex justify-end">
        <button id="addTx" class="btn btn-primary text-sm">+ Add transaction</button>
      </div>
      <ul id="list" class="space-y-2 max-h-80 overflow-y-auto">
        ${rows.length === 0 ? '<li class="text-sm text-slate-500">No transactions yet.</li>'
          : rows.map((t) => `
            <li class="flex justify-between p-2 rounded border border-slate-200 dark:border-slate-700">
              <div>
                <div class="text-sm font-medium">${esc(t.description || t.type)}</div>
                <div class="text-xs text-slate-500">${fmtDate(t.date)}</div>
              </div>
              <div class="flex items-center gap-2">
                <span class="font-semibold ${t.type === 'Received' ? 'text-red-600' : 'text-green-600'}">
                  ${t.type === 'Received' ? '-' : '+'}${esc(inr(t.amount))}
                </span>
                <button class="btn btn-ghost text-red-600 text-xs" data-del-tx="${t.id}">🗑</button>
              </div>
            </li>`).join('')}
      </ul>
    `,
    onMount(body, close) {
      body.querySelector('#addTx').onclick = () => {
        close();
        openTxForm(target, customer);
      };
      body.querySelectorAll('[data-del-tx]').forEach((b) => {
        b.onclick = async () => {
          if (!await confirm('Delete this transaction?')) return;
          const { error } = await supabase.from('customer_transactions').delete().eq('id', b.dataset.delTx);
          if (error) return toast(error.message, 'error');
          toast('Deleted');
          close();
          openTxList(target, customer);
        };
      });
    },
  });
}

function openTxForm(target, customer) {
  openModal({
    title: `Add transaction — ${customer.name}`,
    bodyHtml: `
      <form id="f" class="space-y-3">
        <div><label class="text-sm">Date</label>
             <input class="field" type="date" name="date" required value="${today()}"></div>
        <div><label class="text-sm">Amount (₹)</label>
             <input class="field" type="number" step="0.01" name="amount" required></div>
        <div><label class="text-sm">Description</label>
             <input class="field" name="description" placeholder="e.g. Goods purchased"></div>
        <div><label class="text-sm">Type</label>
             <select class="field" name="type">
               <option>Given</option><option>Received</option>
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
        fd.customer_id = customer.id;
        const { error } = await db().from('customer_transactions').insert([fd]);
        if (error) return toast(error.message, 'error');
        toast('Transaction added');
        close();
        draw(target);
      };
    },
  });
}
