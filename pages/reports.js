// Reports — read-only summary across all data, with month grouping.

import { db } from '../db.js';
import { mount, esc, inr } from '../ui.js';

export async function renderReports(target) {
  mount(target, `<div class="text-slate-500">Crunching numbers…</div>`);
  const supabase = db();

  const [{ data: customers = [] }, { data: custTx = [] },
         { data: expenses = [] },  { data: loans = [] },
         { data: loanTx = [] },    { data: chits = [] },
         { data: chitMembers = [] }, { data: chitTx = [] }] = await Promise.all([
    supabase.from('customers').select('*'),
    supabase.from('customer_transactions').select('*'),
    supabase.from('expenses').select('*'),
    supabase.from('loans').select('*'),
    supabase.from('loan_transactions').select('*'),
    supabase.from('chits').select('*'),
    supabase.from('chit_members').select('id, chit_id'),
    supabase.from('chit_transactions').select('*'),
  ]);

  // Per-chit roll-up
  const memberById = Object.fromEntries(chitMembers.map((m) => [m.id, m]));
  const chitStats = {};
  for (const t of chitTx) {
    const m = memberById[t.member_id];
    if (!m) continue;
    chitStats[m.chit_id] ??= { collected: 0, given: 0 };
    if (t.type === 'Given')    chitStats[m.chit_id].collected += Number(t.amount);
    if (t.type === 'Received') chitStats[m.chit_id].given     += Number(t.amount);
  }
  const chitRows = chits.map((c) => ({
    name: c.name, status: c.status,
    collected: chitStats[c.id]?.collected || 0,
    given:     chitStats[c.id]?.given     || 0,
  }));

  // Group expenses + income by YYYY-MM
  const monthly = {};
  for (const r of expenses) {
    const m = (r.expense_date || '').slice(0, 7);
    if (!m) continue;
    monthly[m] ??= { income: 0, expense: 0 };
    monthly[m][r.type === 'Income' ? 'income' : 'expense'] += Number(r.amount);
  }
  const months = Object.keys(monthly).sort().reverse().slice(0, 12);

  // Top customers by outstanding balance
  const customerStats = customers.map((c) => {
    const ct = custTx.filter((t) => t.customer_id === c.id);
    const given    = ct.filter((t) => t.type === 'Given').reduce((s, t) => s + Number(t.amount), 0);
    const received = ct.filter((t) => t.type === 'Received').reduce((s, t) => s + Number(t.amount), 0);
    return { name: c.name, balance: given - received };
  }).sort((a, b) => b.balance - a.balance).slice(0, 5);

  // Loan summary
  const loanRows = loans.map((l) => {
    const paid = loanTx.filter((t) => t.loan_id === l.id && t.type === 'Payment')
                       .reduce((s, t) => s + Number(t.amount), 0);
    return { name: l.name, type: l.type, principal: Number(l.principal), paid, balance: Number(l.principal) - paid };
  });

  // Print + CSV download helpers
  const reportTitle = `BizManager report — ${new Date().toLocaleDateString()}`;

  mount(target, `
    <div class="flex justify-between items-start flex-wrap gap-3 mb-6">
      <h1 class="text-3xl font-bold">Summary Report</h1>
      <div class="flex gap-2">
        <button id="print" class="btn btn-ghost border border-slate-300 dark:border-slate-600">🖨 Print</button>
        <button id="csv"   class="btn btn-primary">⬇ Download CSV</button>
      </div>
    </div>

    <div class="card mb-6">
      <h2 class="text-lg font-semibold mb-3">Last 12 months — income vs expense</h2>
      ${months.length === 0
        ? `<p class="text-sm text-slate-500">No expense entries yet.</p>`
        : `<div class="overflow-x-auto"><table class="tbl">
             <thead><tr><th>Month</th><th>Income</th><th>Expense</th><th>Net</th></tr></thead>
             <tbody>
               ${months.map((m) => {
                 const v = monthly[m];
                 const net = v.income - v.expense;
                 return `<tr>
                   <td>${esc(m)}</td>
                   <td class="text-green-600">${inr(v.income)}</td>
                   <td class="text-red-600">${inr(v.expense)}</td>
                   <td class="font-semibold ${net >= 0 ? 'text-green-600' : 'text-red-600'}">${inr(net)}</td>
                 </tr>`;
               }).join('')}
             </tbody>
           </table></div>`}
    </div>

    <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
      <div class="card">
        <h2 class="text-lg font-semibold mb-3">Top 5 customers by outstanding</h2>
        ${customerStats.length === 0
          ? `<p class="text-sm text-slate-500">No customers yet.</p>`
          : `<table class="tbl"><thead><tr><th>Customer</th><th>Balance</th></tr></thead>
              <tbody>${customerStats.map((c) => `
                <tr><td>${esc(c.name)}</td><td class="font-semibold">${inr(c.balance)}</td></tr>`).join('')}
              </tbody></table>`}
      </div>

      <div class="card">
        <h2 class="text-lg font-semibold mb-3">Chits</h2>
        ${chitRows.length === 0
          ? `<p class="text-sm text-slate-500">No chits yet.</p>`
          : `<table class="tbl"><thead><tr>
                <th>Name</th><th>Collected</th><th>Given</th><th>Savings</th>
              </tr></thead>
              <tbody>${chitRows.map((c) => `
                <tr>
                  <td>${esc(c.name)}</td>
                  <td class="text-green-600">${inr(c.collected)}</td>
                  <td class="text-red-600">${inr(c.given)}</td>
                  <td class="font-semibold">${inr(c.collected - c.given)}</td>
                </tr>`).join('')}
              </tbody></table>`}
      </div>

      <div class="card">
        <h2 class="text-lg font-semibold mb-3">Loans</h2>
        ${loanRows.length === 0
          ? `<p class="text-sm text-slate-500">No loans yet.</p>`
          : `<table class="tbl"><thead><tr>
                <th>Name</th><th>Type</th><th>Balance</th>
              </tr></thead>
              <tbody>${loanRows.map((l) => `
                <tr><td>${esc(l.name)}</td><td>${esc(l.type)}</td><td class="font-semibold">${inr(l.balance)}</td></tr>`).join('')}
              </tbody></table>`}
      </div>
    </div>
  `);

  target.querySelector('#print').onclick = () => {
    document.title = reportTitle;
    window.print();
  };
  target.querySelector('#csv').onclick = () => {
    const lines = [['Section', 'Key', 'Value 1', 'Value 2', 'Value 3']];
    lines.push(['Generated', reportTitle]);
    lines.push([]);
    lines.push(['Monthly', 'Month', 'Income', 'Expense', 'Net']);
    months.forEach((m) => {
      const v = monthly[m];
      lines.push(['Monthly', m, v.income, v.expense, v.income - v.expense]);
    });
    lines.push([]);
    lines.push(['Customers', 'Name', 'Balance']);
    customerStats.forEach((c) => lines.push(['Customers', c.name, c.balance]));
    lines.push([]);
    lines.push(['Loans', 'Name', 'Type', 'Principal', 'Paid', 'Balance']);
    loanRows.forEach((l) => lines.push(['Loans', l.name, l.type, l.principal, l.paid, l.balance]));

    const csv = lines.map((row) => row.map(csvCell).join(',')).join('\n');
    download(csv, `bizmanager-report-${new Date().toISOString().slice(0,10)}.csv`, 'text/csv');
  };
}

function csvCell(v) {
  if (v === null || v === undefined) return '';
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s;
}

function download(text, filename, mime) {
  const blob = new Blob([text], { type: mime });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}
