// ui.js — tiny helpers shared by every page.

/** Render trusted HTML into a target element. */
export function mount(target, html) {
  target.innerHTML = html;
  target.classList.add('page-enter');
  // re-trigger the css animation on every page change
  void target.offsetWidth;
}

/** Build an HTML string safely-ish: escapes anything passed as ${value}. */
export function esc(v) {
  if (v === null || v === undefined) return '';
  return String(v)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

/** Format a number as Indian rupees. */
export function inr(n) {
  const v = Number(n) || 0;
  return '₹' + v.toLocaleString('en-IN');
}

/** Format an ISO date as a friendly local date. */
export function fmtDate(s) {
  if (!s) return '';
  const d = new Date(s);
  return isNaN(d) ? s : d.toLocaleDateString();
}

/** Return today's date in YYYY-MM-DD form. */
export function today() {
  return new Date().toISOString().slice(0, 10);
}

/** Show a green/red toast in the top-right. */
export function toast(message, type = 'success') {
  const el = document.createElement('div');
  const colors = {
    success: 'bg-green-600',
    error:   'bg-red-600',
    info:    'bg-slate-700'
  };
  el.className = `${colors[type] || colors.info} fixed top-4 right-4 z-[60] text-white px-4 py-2 rounded-lg shadow-lg`;
  el.textContent = message;
  document.body.appendChild(el);
  setTimeout(() => {
    el.style.transition = 'opacity .3s';
    el.style.opacity = '0';
    setTimeout(() => el.remove(), 300);
  }, 2500);
}

/**
 * Open a modal. `bodyHtml` is rendered inside.
 * Returns { close }. Use data-modal-close on any button to close.
 */
export function openModal({ title, bodyHtml, onMount }) {
  const wrap = document.createElement('div');
  wrap.className = 'modal-backdrop';
  wrap.innerHTML = `
    <div class="card w-full max-w-md" style="max-height:90vh; overflow-y:auto;">
      <div class="flex justify-between items-center mb-4">
        <h3 class="text-xl font-semibold">${esc(title)}</h3>
        <button class="btn btn-ghost" data-modal-close aria-label="Close">✕</button>
      </div>
      <div data-modal-body>${bodyHtml}</div>
    </div>
  `;
  const close = () => wrap.remove();
  wrap.addEventListener('click', (e) => {
    if (e.target === wrap) close();
    if (e.target.closest('[data-modal-close]')) close();
  });
  document.body.appendChild(wrap);
  if (onMount) onMount(wrap.querySelector('[data-modal-body]'), close);
  return { close };
}

/** Friendly confirm dialog (replacement for window.confirm). */
export function confirm(message) {
  return new Promise((resolve) => {
    openModal({
      title: 'Are you sure?',
      bodyHtml: `
        <p class="mb-6 text-slate-600 dark:text-slate-300">${esc(message)}</p>
        <div class="flex justify-end gap-2">
          <button class="btn btn-ghost" data-no>Cancel</button>
          <button class="btn btn-danger" data-yes>Yes, do it</button>
        </div>
      `,
      onMount(body, close) {
        body.querySelector('[data-no]').onclick = () => { close(); resolve(false); };
        body.querySelector('[data-yes]').onclick = () => { close(); resolve(true); };
      }
    });
  });
}
