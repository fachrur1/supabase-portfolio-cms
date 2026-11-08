// admin/src/main.js - app shell, hash router, auth guard, login screen.
import {
  getSession, signIn, signOut, onAuthChange, checkAdmin, envConfigured,
} from './api.js';
import { el, esc, icons, toast, loadingSkeleton, errorStateHtml, errorMessage } from './ui.js';
import { modules } from './schemas.js';
import { renderListPage, renderFormPage, flushActiveFormDraft } from './crud.js';
import { renderDashboard } from './views/dashboard.js';
import { renderProfile } from './views/profile.js';
import { renderContact } from './views/contact.js';
import { renderDocuments } from './views/documents.js';
import { renderSettings } from './views/settings.js';
import { renderWorkPage } from './views/work.js';

/* ------------------------------------------------------------------ */
/* Navigation model                                                    */
/* ------------------------------------------------------------------ */

const NAV_ITEMS = [
  { section: 'dashboard', route: '#/dashboard', label: 'Dashboard', icon: 'dashboard' },
  { section: 'work', route: '#/work', label: 'Projects & Experiences', icon: 'projects' },
  { section: 'education', route: '#/education', label: 'Education', icon: 'education' },
  { section: 'skills', route: '#/skills', label: 'Skills', icon: 'skills' },
  { section: 'organizations', route: '#/organizations', label: 'Organizations', icon: 'organizations' },
  { section: 'gallery', route: '#/gallery', label: 'Photography / Gallery', icon: 'gallery' },
  { section: 'motion', route: '#/motion', label: 'Motion in Frames', icon: 'video' },
  { section: 'render3d', route: '#/render3d', label: '3D Renders', icon: 'render' },
  { section: 'profile', route: '#/profile', label: 'About & Profile', icon: 'profile' },
  { section: 'contact', route: '#/contact', label: 'Contact & Social Links', icon: 'contact' },
  { section: 'documents', route: '#/documents', label: 'CV / Documents', icon: 'documents' },
  { section: 'settings', route: '#/settings', label: 'Website Settings', icon: 'settings' },
];

const app = document.getElementById('app');
const state = {
  session: null,
  admin: null, // { ok, role }
  adminUserId: null,
};
let navGuard = null;
let suppressGuard = false;

const navigate = (hash) => {
  window.location.hash = hash;
};

/* ------------------------------------------------------------------ */
/* Setup notice (missing env vars)                                     */
/* ------------------------------------------------------------------ */

function renderSetupNotice() {
  app.innerHTML = `
    <div class="setup-notice">
      <div class="setup-card">
        <div class="setup-icon">${icons.settings}</div>
        <h1>CMS setup required</h1>
        <p>
          The admin dashboard cannot start because the Supabase environment variables
          are not configured for this build.
        </p>
        <p>Set the following variables <strong>at build time</strong> (e.g. in a <code>.env</code> file at the repo root):</p>
        <pre><code>VITE_SUPABASE_URL=https://your-project-ref.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-public-key</code></pre>
        <p>
          Never use a service-role key here - the dashboard runs entirely in the browser
          and relies on Supabase Row Level Security for authorization.
        </p>
        <p>See <code>CMS_SETUP.md</code> in the <code>admin/</code> directory for the full setup guide.</p>
      </div>
    </div>`;
}

/* ------------------------------------------------------------------ */
/* App shell                                                           */
/* ------------------------------------------------------------------ */

function renderShell() {
  app.innerHTML = `
    <div class="app-shell">
      <aside class="sidebar" id="sidebar">
        <div class="sidebar-brand">
          <span class="brand-mark">${icons.file}</span>
          <div>
            <div class="brand-name">Portfolio CMS</div>
            <div class="brand-sub">Admin dashboard</div>
          </div>
        </div>
        <nav class="sidebar-nav" aria-label="Main navigation">
          ${NAV_ITEMS.map((item) => `
            <a class="nav-item" href="${esc(item.route)}" data-section="${esc(item.section)}">
              ${icons[item.icon]}<span>${esc(item.label)}</span>
            </a>`).join('')}
        </nav>
        <div class="sidebar-footer">
          <div class="sidebar-user" data-role="user-email">Signed in</div>
          <button class="btn btn-ghost btn-block" data-act="signout" type="button">
            ${icons.logout}<span>Sign out</span>
          </button>
        </div>
      </aside>
      <div class="sidebar-overlay" data-act="close-sidebar"></div>
      <div class="main">
        <header class="topbar">
          <button class="icon-btn hamburger" data-act="toggle-sidebar" type="button" aria-label="Toggle navigation">
            ${icons.menu}
          </button>
          <h1 class="topbar-title" data-role="topbar-title">Dashboard</h1>
          <div class="topbar-spacer"></div>
          <a class="topbar-link" href="../" target="_blank" rel="noopener">${icons.external}<span>View site</span></a>
        </header>
        <main class="content" id="content"></main>
      </div>
    </div>`;

  app.querySelector('[data-act="signout"]').addEventListener('click', async () => {
    await signOut();
    state.session = null;
    state.admin = null;
    state.adminUserId = null;
    toast('Signed out.');
    renderLogin();
  });
  app.querySelector('[data-act="toggle-sidebar"]').addEventListener('click', () => {
    document.body.classList.toggle('sidebar-open');
  });
  app.querySelector('[data-act="close-sidebar"]').addEventListener('click', () => {
    document.body.classList.remove('sidebar-open');
  });
}

function setActiveNav(section) {
  const activeSection = ['projects', 'experiences'].includes(section) ? 'work' : section;
  document.querySelectorAll('.nav-item').forEach((item) => {
    item.classList.toggle('active', item.dataset.section === activeSection);
    if (item.dataset.section === activeSection) item.setAttribute('aria-current', 'page');
    else item.removeAttribute('aria-current');
  });
  const titleEl = document.querySelector('[data-role="topbar-title"]');
  const item = NAV_ITEMS.find((i) => i.section === activeSection);
  if (titleEl) titleEl.textContent = item ? item.label : 'Portfolio CMS';
  document.body.classList.remove('sidebar-open');
}

function setUserEmail(email) {
  const elx = document.querySelector('[data-role="user-email"]');
  if (elx) elx.textContent = email || 'Signed in';
}

/* ------------------------------------------------------------------ */
/* Login screen                                                        */
/* ------------------------------------------------------------------ */

function renderLogin() {
  app.innerHTML = `
    <div class="login-page">
      <form class="login-card" novalidate>
        <div class="login-brand">
          <span class="brand-mark lg">${icons.file}</span>
          <h1>Portfolio CMS</h1>
          <p class="text-muted">Sign in with your admin account</p>
        </div>
        <div class="field">
          <label class="field-label" for="login-email">Email</label>
          <div class="field-control">
            <input class="input" id="login-email" name="email" type="email" autocomplete="username" placeholder="you@example.com" />
          </div>
          <p class="field-error hidden" role="alert"></p>
        </div>
        <div class="field">
          <label class="field-label" for="login-password">Password</label>
          <div class="field-control">
            <input class="input" id="login-password" name="password" type="password" autocomplete="current-password" placeholder="••••••••" />
          </div>
          <p class="field-error hidden" role="alert"></p>
        </div>
        <div class="login-error hidden" role="alert"></div>
        <button class="btn btn-primary btn-block" type="submit">Sign in</button>
        <p class="login-note text-muted">Access is restricted to approved admin accounts. There is no public registration.</p>
      </form>
    </div>`;

  const form = app.querySelector('.login-card');
  const emailInput = form.querySelector('#login-email');
  const passwordInput = form.querySelector('#login-password');
  const loginError = form.querySelector('.login-error');

  const setFieldError = (input, message) => {
    const field = input.closest('.field');
    const errEl = field.querySelector('.field-error');
    if (message) {
      field.classList.add('has-error');
      errEl.textContent = message;
      errEl.classList.remove('hidden');
      input.setAttribute('aria-invalid', 'true');
    } else {
      field.classList.remove('has-error');
      errEl.textContent = '';
      errEl.classList.add('hidden');
      input.removeAttribute('aria-invalid');
    }
  };

  [emailInput, passwordInput].forEach((input) => {
    input.addEventListener('input', () => setFieldError(input, null));
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    loginError.classList.add('hidden');
    const email = emailInput.value.trim();
    const password = passwordInput.value;
    let valid = true;

    if (!email) {
      setFieldError(emailInput, 'Email is required.');
      valid = false;
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setFieldError(emailInput, 'Enter a valid email address.');
      valid = false;
    }
    if (!password) {
      setFieldError(passwordInput, 'Password is required.');
      valid = false;
    }
    if (!valid) return;

    const btn = form.querySelector('button[type="submit"]');
    btn.disabled = true;
    btn.innerHTML = `${icons.spinner}<span>Signing in…</span>`;

    const { user, error } = await signIn(email, password);

    btn.disabled = false;
    btn.textContent = 'Sign in';

    if (error) {
      loginError.textContent = error;
      loginError.classList.remove('hidden');
      return;
    }
    state.session = { user };
    toast('Signed in.');
    route();
  });
}

/* ------------------------------------------------------------------ */
/* Not-authorized screen                                               */
/* ------------------------------------------------------------------ */

function renderNotAuthorized() {
  const content = document.getElementById('content') || app;
  content.innerHTML = `
    <div class="page">
      <div class="empty-state">
        <div class="empty-icon">${icons.alert}</div>
        <h2>Not authorized</h2>
        <p>Your account is signed in but does not have admin access to this CMS.</p>
        <p class="text-muted">Ask the site owner to add your user to the <code>admin_users</code> table.</p>
        <button class="btn btn-ghost" data-act="signout-anywhere" type="button">${icons.logout}<span>Sign out</span></button>
      </div>
    </div>`;
  content.querySelector('[data-act="signout-anywhere"]').addEventListener('click', async () => {
    await signOut();
    state.session = null;
    state.admin = null;
    state.adminUserId = null;
    renderLogin();
  });
}

/* ------------------------------------------------------------------ */
/* Router                                                              */
/* ------------------------------------------------------------------ */

function parseRoute() {
  const hash = window.location.hash || '#/dashboard';
  const parts = hash.replace(/^#\/?/, '').split('/').filter(Boolean);
  return { section: parts[0] || 'dashboard', action: parts[1] || null, id: parts[2] || null, hash };
}

async function route() {
  // Snapshot an unsaved form before its DOM is thrown away (tab switches).
  flushActiveFormDraft();
  const { section, action, id } = parseRoute();

  if (!envConfigured) {
    renderSetupNotice();
    return;
  }

  if (section === 'login') {
    renderLogin();
    return;
  }

  // Auth gate: every route except #/login requires a session.
  if (!state.session) {
    const session = await getSession();
    if (!session) {
      renderLogin();
      return;
    }
    state.session = session;
    state.admin = null;
    state.adminUserId = null;
  }

  // Admin gate: the user must have an admin_users row.
  const userId = state.session.user ? state.session.user.id : null;
  const stale = !state.adminCheckedAt || Date.now() - state.adminCheckedAt > 5 * 60 * 1000;
  if (!state.admin || state.adminUserId !== userId || stale) {
    const content = document.getElementById('content');
    if (content) content.innerHTML = loadingSkeleton(4);
    state.admin = await checkAdmin(userId);
    state.adminUserId = userId;
    state.adminCheckedAt = Date.now();
    if (!state.admin.ok) {
      renderNotAuthorized();
      return;
    }
    setUserEmail(state.session.user ? state.session.user.email : '');
  }

  if (!document.getElementById('content')) renderShell();
  const container = document.getElementById('content');
  setActiveNav(section);

  const hooks = {
    setGuard: (fn) => {
      navGuard = fn;
    },
    navigate,
  };

  if (section === 'dashboard') {
    renderDashboard(container, navigate);
    return;
  }
  if (section === 'profile') {
    renderProfile(container, hooks);
    return;
  }
  if (section === 'contact') {
    renderContact(container);
    return;
  }
  if (section === 'documents') {
    renderDocuments(container);
    return;
  }
  if (section === 'settings') {
    renderSettings(container);
    return;
  }
  if (section === 'work') {
    renderWorkPage(container, navigate, action || 'all');
    return;
  }
  // Keep old list URLs working, but render them inside the unified section.
  if (section === 'projects' && !action) {
    renderWorkPage(container, navigate, 'projects');
    return;
  }
  if (section === 'experiences' && !action) {
    renderWorkPage(container, navigate, 'experiences');
    return;
  }
  if (modules[section]) {
    const config = modules[section];
    if (action === 'new') {
      renderFormPage(container, config, null, navigate, hooks);
    } else if (action === 'edit' && id) {
      renderFormPage(container, config, id, navigate, hooks);
    } else {
      renderListPage(container, config, navigate);
    }
    return;
  }

  container.innerHTML = `
    <div class="page">
      <div class="empty-state">
        <div class="empty-icon">${icons.alert}</div>
        <h2>Page not found</h2>
        <p>The route <code>${esc('#/' + [section, action, id].filter(Boolean).join('/'))}</code> does not exist.</p>
        <a class="btn btn-primary" href="#/dashboard">Go to Dashboard</a>
      </div>
    </div>`;
}

/* ------------------------------------------------------------------ */
/* Boot                                                                */
/* ------------------------------------------------------------------ */

function boot() {
  if (!envConfigured) {
    renderSetupNotice();
    return;
  }

  if (!window.location.hash) {
    window.location.hash = '#/dashboard';
  }

  let currentHash = window.location.hash || '#/dashboard';
  window.addEventListener('hashchange', () => {
    const target = window.location.hash;
    if (suppressGuard) {
      suppressGuard = false;
      currentHash = target;
      return;
    }
    if (navGuard) {
      const proceed = navGuard();
      navGuard = null;
      if (!proceed) {
        suppressGuard = true;
        window.location.hash = currentHash;
        return;
      }
    }
    currentHash = target;
    route();
  });

  onAuthChange((session) => {
    state.session = session;
    state.admin = null;
    state.adminUserId = null;
    if (!session) {
      renderLogin();
    } else if (document.getElementById('content')) {
      route();
    }
  });

  route();
}

boot();
