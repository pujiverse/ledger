// login.js — email + password login / signup / forgot-password.

import { signIn, signUp, sendReset } from './db.js';
import { mount, esc, toast } from './ui.js';

export function renderLogin(target, { onDone }) {
  let mode = 'login'; // 'login' | 'signup' | 'reset'

  function paint() {
    const titles = {
      login:  'Sign in',
      signup: 'Create your account',
      reset:  'Forgot your password?',
    };
    const submit = {
      login:  'Sign in',
      signup: 'Sign up',
      reset:  'Send reset link',
    };

    mount(target, `
      <div class="min-h-screen flex items-center justify-center p-4">
        <div class="card w-full max-w-md">
          <div class="flex items-center gap-3 mb-2">
            <div class="w-10 h-10 rounded-lg bg-primary text-white flex items-center justify-center font-bold text-xl">B</div>
            <h1 class="text-2xl font-bold">${titles[mode]}</h1>
          </div>
          <p class="text-sm text-slate-600 dark:text-slate-300 mb-6">
            ${mode === 'signup'
              ? 'The very first account in this database becomes the admin. Everyone after that is a customer until an admin promotes them.'
              : mode === 'reset'
                ? 'Enter your email and Supabase will send you a link to set a new password.'
                : 'Use the email and password you signed up with.'
            }
          </p>

          <form id="f" class="space-y-3">
            ${mode === 'signup' ? `
              <div><label class="text-sm">Your name</label>
                   <input class="field" name="full_name" placeholder="Optional"></div>` : ''}

            <div><label class="text-sm">Email</label>
                 <input class="field" name="email" type="email" autocomplete="email" required></div>

            ${mode !== 'reset' ? `
              <div><label class="text-sm">Password</label>
                   <input class="field" name="password" type="password" autocomplete="${mode === 'signup' ? 'new-password' : 'current-password'}" minlength="6" required></div>` : ''}

            <div id="msg" class="text-sm hidden"></div>

            <button class="btn btn-primary w-full justify-center">${submit[mode]}</button>
          </form>

          <div class="flex flex-wrap gap-3 justify-between text-sm mt-4">
            ${mode !== 'login'  ? `<button data-mode="login"  class="text-primary hover:underline">Have an account? Sign in</button>` : ''}
            ${mode !== 'signup' ? `<button data-mode="signup" class="text-primary hover:underline">New here? Sign up</button>` : ''}
            ${mode !== 'reset'  ? `<button data-mode="reset"  class="text-primary hover:underline">Forgot password?</button>` : ''}
          </div>
        </div>
      </div>
    `);

    target.querySelectorAll('[data-mode]').forEach((b) =>
      b.onclick = () => { mode = b.dataset.mode; paint(); });

    target.querySelector('#f').onsubmit = async (e) => {
      e.preventDefault();
      const fd = Object.fromEntries(new FormData(e.target));
      const msg = target.querySelector('#msg');
      const showMsg = (text, ok) => {
        msg.classList.remove('hidden');
        msg.className = 'text-sm p-3 rounded-lg ' +
          (ok ? 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-200'
              : 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200');
        msg.textContent = text;
      };
      try {
        if (mode === 'login') {
          await signIn(fd.email.trim(), fd.password);
          toast('Welcome back!');
          onDone();
        } else if (mode === 'signup') {
          await signUp(fd.email.trim(), fd.password, fd.full_name);
          showMsg('Account created. Check your email if confirmation is required, then sign in.', true);
          mode = 'login'; setTimeout(paint, 1500);
        } else {
          await sendReset(fd.email.trim());
          showMsg('Reset link sent. Check your inbox.', true);
        }
      } catch (err) {
        showMsg(err.message || String(err), false);
      }
    };
  }

  paint();
}
