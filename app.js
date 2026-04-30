// app.js — top level. Layout, hash router, auth gate, theme.

import { getCreds, getMe, signOut, onAuthChange } from './db.js';
import { renderSetup }   from './setup.js';
import { renderLogin }   from './login.js';
import { mount, esc, toast } from './ui.js';
import { renderHome }         from './pages/home.js';
import { renderCustomers }    from './pages/customers.js';
import { renderChits }        from './pages/chits.js';
import { renderChitDetails }  from './pages/chit-details.js';
import { renderExpenses }     from './pages/expenses.js';
import { renderLoans }        from './pages/loans.js';
import { renderReports }      from './pages/reports.js';
import { renderSettings }     from './pages/settings.js';

// ----- Theme: persists between sessions, defaults to system. -----
const THEME_KEY = 'bizmgr.theme';
function applyTheme() {
  const saved = localStorage.getItem(THEME_KEY);
  const dark = saved === 'dark' ||
    (!saved && window.matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.classList.toggle('dark', dark);
}
applyTheme();
window.toggleTheme = () => {
  const isDark = document.documentElement.classList.toggle('dark');
  localStorage.setItem(THEME_KEY, isDark ? 'dark' : 'light');
};

// ----- Routes -----
// `hidden: true` keeps a route reachable but out of the sidebar.
const ROUTES = [
  { path: '/',                    name: 'Home',               icon: '🏠', render: renderHome },
  { path: '/daily-business',      name: 'Daily Business',     icon: '👥', render: renderCustomers },
  { path: '/chits',               name: 'Chits',              icon: '🎟️', render: renderChits },
  { path: '/chits/:id',           name: 'Chit details',       icon: '🎟️', render: renderChitDetails, hidden: true },
  { path: '/household-expenses',  name: 'Household Expenses', icon: '💸', render: renderExpenses },
  { path: '/loans',               name: 'Loans',              icon: '🏦', render: renderLoans },
  { path: '/summary-report',      name: 'Summary Report',     icon: '📊', render: renderReports },
  { path: '/settings',            name: 'Settings',           icon: '⚙️', render: renderSettings },
];

const root = document.getElementById('app');
let me = null;        // { user, profile } or null
let unsubAuth = null; // unsubscribe from auth state changes

function currentPath() {
  const h = (location.hash || '#/').replace(/^#/, '');
  return h.startsWith('/') ? h : '/' + h;
}

/** Match a path against ROUTES. Supports `:param` segments. */
function matchRoute(path) {
  const exact = ROUTES.find((r) => r.path === path);
  if (exact) return { route: exact, params: {} };
  for (const r of ROUTES) {
    if (!r.path.includes(':')) continue;
    const re = new RegExp('^' + r.path.replace(/:([^/]+)/g, '([^/]+)') + '$');
    const m = path.match(re);
    if (m) {
      const keys = [...r.path.matchAll(/:([^/]+)/g)].map((x) => x[1]);
      const params = Object.fromEntries(keys.map((k, i) => [k, decodeURIComponent(m[i + 1])]));
      return { route: r, params };
    }
  }
  return null;
}

function shell(activePath) {
  const visible = ROUTES.filter((r) => !r.hidden);
  // Highlight the chits link even when on a chit details page
  const isOnChitDetails = activePath.startsWith('/chits/') && activePath !== '/chits';

  const links = visible.map((r) => {
    const isActive =
      activePath === r.path ||
      (r.path === '/chits' && isOnChitDetails);
    return `
      <a href="#${r.path}"
         class="flex items-center gap-3 px-4 py-2.5 rounded-lg transition
                ${isActive
                  ? 'bg-primary text-white'
                  : 'hover:bg-slate-200 dark:hover:bg-slate-700'}">
        <span class="text-lg">${r.icon}</span>
        <span class="font-medium">${esc(r.name)}</span>
      </a>`;
  }).join('');

  const role = me?.profile?.role || 'customer';
  const email = me?.profile?.email || me?.user?.email || '';
  const roleBadge = role === 'admin'
    ? '<span class="px-2 py-0.5 text-xs rounded-full bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200 font-semibold">ADMIN</span>'
    : '<span class="px-2 py-0.5 text-xs rounded-full bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-200 font-semibold">customer</span>';

  return `
    <div class="flex min-h-screen">
      <button id="menu-btn"
              class="md:hidden fixed top-3 left-3 z-40 btn btn-ghost bg-white dark:bg-slate-800 shadow">☰</button>

      <aside id="sidebar"
             class="fixed md:static inset-y-0 left-0 z-30 w-64
                    bg-white dark:bg-slate-800 shadow-md
                    -translate-x-full md:translate-x-0 transition-transform flex flex-col">
        <div class="px-5 py-5 border-b border-slate-200 dark:border-slate-700 flex items-center gap-2">
          <div class="w-9 h-9 rounded-lg bg-primary text-white flex items-center justify-center font-bold">B</div>
          <div>
            <div class="font-bold leading-tight">BizManager</div>
            <div class="text-xs text-slate-500">Lite</div>
          </div>
        </div>
        <nav class="p-3 space-y-1 flex-1 overflow-y-auto">${links}</nav>

        <div class="p-3 border-t border-slate-200 dark:border-slate-700 space-y-2">
          <div class="text-xs text-slate-500 truncate" title="${esc(email)}">${esc(email)}</div>
          <div class="flex items-center justify-between gap-2">
            ${roleBadge}
            <button onclick="toggleTheme()" class="btn btn-ghost text-sm" title="Toggle theme">🌗</button>
          </div>
          <button id="signout-btn" class="btn btn-ghost text-sm text-red-600 w-full justify-center">Sign out</button>
        </div>
      </aside>

      <main class="flex-1 p-4 md:p-8 overflow-x-auto">
        <div id="page"></div>
      </main>
    </div>
  `;
}

async function render() {
  // 1. No URL/key yet → setup wizard
  if (!getCreds()) {
    renderSetup(root, { onDone: () => render() });
    return;
  }

  // 2. URL/key exists → check session. If none → login screen.
  try {
    me = await getMe();
  } catch (e) {
    me = null;
    console.error(e);
  }
  if (!me) {
    if (!unsubAuth) unsubAuth = onAuthChange(() => render());
    renderLogin(root, { onDone: () => render() });
    return;
  }

  // 3. Logged in → render the layout for the current route
  const path = currentPath();
  const m = matchRoute(path) || { route: ROUTES[0], params: {} };

  mount(root, shell(m.route.path));

  // mobile nav
  const sidebar = root.querySelector('#sidebar');
  root.querySelector('#menu-btn').onclick = () =>
    sidebar.classList.toggle('-translate-x-full');
  sidebar.querySelectorAll('a').forEach((a) =>
    a.addEventListener('click', () => sidebar.classList.add('-translate-x-full'))
  );

  root.querySelector('#signout-btn').onclick = async () => {
    if (!confirm('Sign out of this session?')) return;
    await signOut();
    me = null;
    render();
  };

  const pageEl = root.querySelector('#page');
  try {
    m.route.render(pageEl, {
      me,
      params: m.params,
      navigate: (p) => { location.hash = '#' + p; }
    });
  } catch (e) {
    pageEl.innerHTML = `<div class="card text-red-600">${esc(e.message)}</div>`;
    console.error(e);
  }
}

window.addEventListener('hashchange', render);
window.addEventListener('DOMContentLoaded', render);
if (document.readyState !== 'loading') render();

window.addEventListener('unhandledrejection', (e) => {
  console.error(e.reason);
  toast(e.reason?.message || 'Something went wrong.', 'error');
});
