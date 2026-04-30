// Home — dashboard summary across daily business, chits, expenses and loans.

import { db } from '../db.js';
import { mount, esc, inr } from '../ui.js';

export async function renderHome(target, ctx) {
  mount(target, `<div class="text-slate-500">Loading dashboard…</div>`);
  const supabase = db();

  const [cust, custTx, expenses, loans, loanTx, chits, chitMembers, chitTx] = await Promise.all([
    supabase.from('customers').select('*'),
    supabase.from('customer_transactions').select('*'),
    supabase.from('expenses').select('*'),
    supabase.from('loans').select('*'),
    supabase.from('loan_transactions').select('*'),
    supabase.from('chits').select('*'),
    supabase.from('chit_members').select('id, chit_id'),
    supabase.from('chit_transactions').select('*'),
  ]);

  const given     = sum(custTx.data, 'Given');
  const received  = sum(custTx.data, 'Received');
  const income    = sum(expenses.data, 'Income', 'amount', 'type');
  const expense   = sum(expenses.data, 'Expense', 'amount', 'type');
  const loanGiven = (loans.data || []).filter((l) => l.type === 'Given').reduce((s, l) => s + Number(l.principal || 0), 0);
  const loanTaken = (loans.data || []).filter((l) => l.type === 'Taken').reduce((s, l) => s + Number(l.principal || 0), 0);
  const loanPaid  = sum(loanTx.data, 'Payment');
  const chitCollected = sum(chitTx.data, 'Given');
  const chitGiven     = sum(chitTx.data, 'Received');

  const me = ctx?.me?.profile;

  const cards = [
    { label: 'Daily Business — open',  value: inr(given - received),                         icon: '👥', color: 'bg-blue-500' },
    { label: 'Net household',          value: inr(income - expense),                         icon: '💰', color: 'bg-violet-500' },
    { label: 'Loan balance',           value: inr((loanTaken + loanGiven) - loanPaid),       icon: '🏦', color: 'bg-amber-500' },
    { label: 'Chit savings',           value: inr(chitCollected - chitGiven),                icon: '🎟️', color: 'bg-emerald-500' },
  ];

  const recent = [
    ...(custTx.data || []).map((t) => ({ date: t.date, label: `Daily business · ${t.type}`, amount: t.amount, neg: t.type === 'Received' })),
    ...(expenses.data || []).map((t) => ({ date: t.expense_date, label: `${t.type}: ${t.description}`, amount: t.amount, neg: t.type === 'Expense' })),
    ...(loanTx.data || []).map((t) => ({ date: t.date, label: `Loan · ${t.type}`, amount: t.amount, neg: t.type === 'Disbursement' })),
    ...(chitTx.data || []).map((t) => ({ date: t.date, label: `Chit · ${t.type}`, amount: t.amount, neg: t.type === 'Received' })),
  ].sort((a, b) => (b.date || '').localeCompare(a.date || '')).slice(0, 8);

  mount(target, `
    <div class="flex items-center gap-2 mb-2">
      <h1 class="text-3xl font-bold">Welcome${me?.full_name ? ', ' + esc(me.full_name) : me?.email ? ', ' + esc(me.email.split('@')[0]) : ''}</h1>
      ${me?.role === 'admin'
        ? '<span class="px-2 py-0.5 text-xs rounded-full bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200 font-semibold">ADMIN</span>'
        : '<span class="px-2 py-0.5 text-xs rounded-full bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-200 font-semibold">customer</span>'}
    </div>
    <p class="text-slate-500 mb-6">${me?.role === 'admin'
      ? "You can see and edit everyone's data."
      : "You can only see and edit your own records."}</p>

    <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
      ${cards.map((c) => `
        <div class="card flex items-center gap-4">
          <div class="${c.color} text-white w-12 h-12 rounded-xl flex items-center justify-center text-2xl">${c.icon}</div>
          <div>
            <div class="text-sm text-slate-500">${esc(c.label)}</div>
            <div class="text-xl font-bold">${esc(c.value)}</div>
          </div>
        </div>`).join('')}
    </div>

    <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
      <div class="card">
        <h2 class="text-lg font-semibold mb-3">Quick actions</h2>
        <div class="grid grid-cols-2 gap-2">
          <a href="#/daily-business"     class="btn btn-ghost border border-slate-200 dark:border-slate-700 justify-center">+ Customer entry</a>
          <a href="#/chits"              class="btn btn-ghost border border-slate-200 dark:border-slate-700 justify-center">🎟️ Open chits</a>
          <a href="#/household-expenses" class="btn btn-ghost border border-slate-200 dark:border-slate-700 justify-center">+ Expense / Income</a>
          <a href="#/loans"              class="btn btn-ghost border border-slate-200 dark:border-slate-700 justify-center">+ Loan payment</a>
          <a href="#/summary-report"     class="btn btn-ghost border border-slate-200 dark:border-slate-700 justify-center col-span-2">📊 Summary report</a>
          <a href="#/settings"           class="btn btn-ghost border border-slate-200 dark:border-slate-700 justify-center col-span-2">⬆ Bulk import / Backup</a>
        </div>
      </div>

      <div class="card">
        <h2 class="text-lg font-semibold mb-3">Recent activity</h2>
        ${recent.length === 0
          ? `<p class="text-slate-500 text-sm">Nothing yet — go add your first entry.</p>`
          : `<ul class="space-y-2">
               ${recent.map((r) => `
                 <li class="flex justify-between border-b border-slate-100 dark:border-slate-700 pb-2 last:border-0">
                   <div>
                     <div class="text-sm">${esc(r.label)}</div>
                     <div class="text-xs text-slate-500">${esc(r.date || '')}</div>
                   </div>
                   <div class="font-semibold ${r.neg ? 'text-red-600' : 'text-green-600'}">
                     ${r.neg ? '-' : '+'}${esc(inr(r.amount))}
                   </div>
                 </li>`).join('')}
             </ul>`}
      </div>
    </div>
  `);
}

function sum(rows, type) {
  return (rows || []).filter((r) => r.type === type).reduce((s, r) => s + Number(r.amount || 0), 0);
}
