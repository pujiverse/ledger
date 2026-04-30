#!/usr/bin/env bash
# build-bundle.sh — concatenate every JS module into a single bundle.html.
# Useful when you want to deploy ONE file to GitHub Pages and not worry
# about missing imports or folder structure.
#
# Usage:
#   ./build-bundle.sh        # produces bundle.html in the same folder
#
# Requires: bash, sed, node (for syntax verification only — optional).

set -euo pipefail
cd "$(dirname "$0")"

OUT=bundle.html

emit() {
  # Strip relative imports (./… and ../…) and the `export` keyword.
  # CDN imports (https://…) are kept.
  sed -E -e "/^import .* from '(\.\.?)\//d" -e "s/^export (default )?//" "$1"
}

# Map every module that has a single primary export → name of the export.
# These get wrapped in an IIFE so their internal helpers don't collide.
declare -A EXPORTS=(
  ["setup.js"]="renderSetup"
  ["login.js"]="renderLogin"
  ["pages/home.js"]="renderHome"
  ["pages/customers.js"]="renderCustomers"
  ["pages/chits.js"]="renderChits"
  ["pages/chit-details.js"]="renderChitDetails"
  ["pages/expenses.js"]="renderExpenses"
  ["pages/loans.js"]="renderLoans"
  ["pages/reports.js"]="renderReports"
  ["pages/settings.js"]="renderSettings"
)

# 1. Top of HTML
cat > "$OUT" <<'HEAD'
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta name="theme-color" content="#1E40AF" />
  <title>BizManager Lite</title>
  <link rel="manifest" href="manifest.webmanifest" />
  <link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Crect width='100' height='100' rx='20' fill='%231E40AF'/%3E%3Ctext x='50' y='66' font-family='Arial' font-size='52' font-weight='bold' text-anchor='middle' fill='white'%3EB%3C/text%3E%3C/svg%3E" />
  <script src="https://cdn.tailwindcss.com"></script>
  <script>
    tailwind.config = {
      darkMode: 'class',
      theme: { extend: { colors: {
        primary: '#1E40AF', primaryHover: '#1D4ED8', primaryLight: '#DBEAFE',
        success: '#16a34a', danger: '#dc2626', warning: '#d97706'
      }}}
    };
  </script>
  <style>
    html { color-scheme: light dark; }
    .page-enter { animation: fade .25s ease; }
    @keyframes fade { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: translateY(0); } }
    .field { width: 100%; padding: 0.55rem 0.75rem; border: 1px solid rgb(203 213 225); border-radius: 0.5rem; background-color: white; color: inherit; }
    .dark .field { border-color: rgb(71 85 105); background-color: rgb(30 41 59); }
    .field:focus { outline: none; border-color: #1E40AF; box-shadow: 0 0 0 3px rgba(30,64,175,.15); }
    .btn { display: inline-flex; align-items: center; gap: 0.5rem; padding: 0.5rem 1rem; border-radius: 0.5rem; font-weight: 600; transition: background-color 0.15s, transform 0.05s; }
    .btn:active { transform: translateY(1px); }
    .btn-primary { background: #1E40AF; color: white; }
    .btn-primary:hover { background: #1D4ED8; }
    .btn-ghost { background: transparent; color: inherit; }
    .btn-ghost:hover { background: rgba(0,0,0,.05); }
    .dark .btn-ghost:hover { background: rgba(255,255,255,.05); }
    .btn-danger { background: #dc2626; color: white; }
    .btn-danger:hover { background: #b91c1c; }
    .tbl { width: 100%; border-collapse: collapse; }
    .tbl th, .tbl td { padding: 0.6rem 0.75rem; text-align: left; border-bottom: 1px solid rgb(226 232 240); }
    .dark .tbl th, .dark .tbl td { border-color: rgb(51 65 85); }
    .tbl th { background: rgb(248 250 252); font-weight: 600; font-size: 0.85rem; text-transform: uppercase; letter-spacing: 0.04em; }
    .dark .tbl th { background: rgb(30 41 59); }
    .card { background: white; border-radius: 0.75rem; padding: 1.25rem; box-shadow: 0 1px 3px rgba(0,0,0,.05); }
    .dark .card { background: rgb(30 41 59); }
    .modal-backdrop { position: fixed; inset: 0; background: rgba(0,0,0,.5); display: flex; align-items: center; justify-content: center; z-index: 50; padding: 1rem; }
  </style>
  <script src="credentials/config.js" onerror="window.__BIZMGR_NO_CONFIG=true"></script>
</head>
<body class="bg-slate-100 text-slate-900 dark:bg-slate-900 dark:text-slate-100 min-h-screen">
  <div id="app">
    <div class="flex items-center justify-center h-screen text-slate-500">Loading…</div>
  </div>
  <script>
    window.addEventListener('error', (e) => {
      const root = document.getElementById('app');
      if (root && /Loading…/.test(root.innerText)) {
        root.innerHTML = '<div style="padding:2rem;font-family:sans-serif"><h2>Startup error</h2><pre style="white-space:pre-wrap;background:#fee;padding:1rem;border-radius:.5rem">'+(e.message || e.error || e)+'</pre><p>Open DevTools → Console for the full stack.</p></div>';
      }
    });
  </script>
<script type="module">
HEAD

# 2. db.js + ui.js at the top, exposed to every module below.
for f in db.js ui.js; do
  {
    echo
    echo "/* ============================================================ */"
    echo "/*  $f"
    echo "/* ============================================================ */"
    emit "$f"
  } >> "$OUT"
done

# 3. Each page wrapped in an IIFE so its private helpers stay local.
for f in setup.js login.js \
         pages/home.js pages/customers.js pages/chits.js pages/chit-details.js \
         pages/expenses.js pages/loans.js pages/reports.js pages/settings.js; do
  name="${EXPORTS[$f]}"
  {
    echo
    echo "/* ============================================================ */"
    echo "/*  $f  →  exports $name"
    echo "/* ============================================================ */"
    echo "const $name = (() => {"
    emit "$f"
    echo "  return $name;"
    echo "})();"
  } >> "$OUT"
done

# 4. app.js — entry point.
{
  echo
  echo "/* ============================================================ */"
  echo "/*  app.js"
  echo "/* ============================================================ */"
  emit app.js

  cat <<'FOOT'
</script>
</body>
</html>
FOOT
} >> "$OUT"

echo "Wrote $OUT — $(wc -l < "$OUT") lines"

# Optional syntax check
if command -v node >/dev/null; then
  awk '/^<script type="module">$/{flag=1;next} /^<\/script>$/{flag=0} flag' "$OUT" > /tmp/_bundle_check.mjs
  if node --input-type=module --check < /tmp/_bundle_check.mjs 2>/tmp/_bundle_err; then
    echo "Syntax OK ✓"
  else
    echo "Syntax error:"
    cat /tmp/_bundle_err
    exit 1
  fi
fi
