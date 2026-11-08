// admin/src/ui.js - shared UI helpers: DOM, icons, toasts, modals, time, markdown.
import { marked } from 'marked';

/* ------------------------------------------------------------------ */
/* DOM helpers                                                         */
/* ------------------------------------------------------------------ */

export function esc(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Build a single element from an HTML string. */
export function el(html) {
  const tpl = document.createElement('template');
  tpl.innerHTML = html.trim();
  return tpl.content.firstElementChild;
}

export function frag(html) {
  const tpl = document.createElement('template');
  tpl.innerHTML = html;
  return tpl.content;
}

export const qs = (sel, root = document) => root.querySelector(sel);
export const qsa = (sel, root = document) => Array.from(root.querySelectorAll(sel));

/* ------------------------------------------------------------------ */
/* Icons - inline stroke SVGs (currentColor)                           */
/* ------------------------------------------------------------------ */

const svg = (paths, size = 20) =>
  `<svg class="icon" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`;

export const icons = {
  dashboard: svg('<rect x="3" y="3" width="7" height="9" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="12" width="7" height="9" rx="1.5"/><rect x="3" y="16" width="7" height="5" rx="1.5"/>'),
  projects: svg('<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><path d="M3 11h18"/>'),
  experiences: svg('<rect x="3" y="7" width="18" height="13" rx="2"/><path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><path d="M3 12.5h18"/>'),
  education: svg('<path d="M22 10 12 5 2 10l10 5z"/><path d="M6 12.5V17c0 1.2 2.7 3 6 3s6-1.8 6-3v-4.5"/><path d="M22 10v6"/>'),
  skills: svg('<path d="M9 18h6"/><path d="M10 22h4"/><path d="M12 2a7 7 0 0 0-4 12.7c.6.5 1 1.3 1 2.1V18h6v-1.2c0-.8.4-1.6 1-2.1A7 7 0 0 0 12 2z"/>'),
  organizations: svg('<circle cx="9" cy="8" r="3"/><path d="M3 20c0-3 2.7-5 6-5s6 2 6 5"/><circle cx="17" cy="9" r="2.5"/><path d="M17 14c2.5.3 4 2 4 4.5"/>'),
  gallery: svg('<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="8.5" cy="9.5" r="1.5"/><path d="m21 16-5-5-9 9"/>'),
  video: svg('<rect x="2" y="6" width="14" height="12" rx="2"/><path d="m16 10.5 5-3v9l-5-3z"/>'),
  render: svg('<path d="M3 20h18"/><ellipse cx="12" cy="14" rx="8" ry="3.2"/><path d="M4 14V9.5c0-1.8 3.6-3.2 8-3.2s8 1.4 8 3.2V14"/>'),
  profile: svg('<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 3.6-6.5 8-6.5s8 2.5 8 6.5"/>'),
  contact: svg('<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7.5 9 6 9-6"/>'),
  documents: svg('<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/><path d="M9 13h6"/><path d="M9 17h5"/>'),
  settings: svg('<circle cx="12" cy="12" r="3"/><path d="M19.1 14.5a1.6 1.6 0 0 0 .3 1.8l.1.1a1.9 1.9 0 1 1-2.7 2.7l-.1-.1a1.6 1.6 0 0 0-1.8-.3 1.6 1.6 0 0 0-1 1.5V20a1.9 1.9 0 1 1-3.8 0v-.1a1.6 1.6 0 0 0-1-1.5 1.6 1.6 0 0 0-1.8.3l-.1.1a1.9 1.9 0 1 1-2.7-2.7l.1-.1a1.6 1.6 0 0 0 .3-1.8 1.6 1.6 0 0 0-1.5-1H4a1.9 1.9 0 1 1 0-3.8h.1a1.6 1.6 0 0 0 1.5-1 1.6 1.6 0 0 0-.3-1.8l-.1-.1a1.9 1.9 0 1 1 2.7-2.7l.1.1a1.6 1.6 0 0 0 1.8.3h.1a1.6 1.6 0 0 0 1-1.5V4a1.9 1.9 0 1 1 3.8 0v.1a1.6 1.6 0 0 0 1 1.5 1.6 1.6 0 0 0 1.8-.3l.1-.1a1.9 1.9 0 1 1 2.7 2.7l-.1.1a1.6 1.6 0 0 0-.3 1.8v.1a1.6 1.6 0 0 0 1.5 1h.1a1.9 1.9 0 1 1 0 3.8h-.1a1.6 1.6 0 0 0-1.5 1z"/>'),
  edit: svg('<path d="M17 3a2.8 2.8 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5z"/>'),
  trash: svg('<path d="M3 6h18"/><path d="M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M10 11v6"/><path d="M14 11v6"/>'),
  eye: svg('<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z"/><circle cx="12" cy="12" r="3"/>'),
  plus: svg('<path d="M12 5v14"/><path d="M5 12h14"/>'),
  search: svg('<circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/>'),
  upload: svg('<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m7 9 5-5 5 5"/><path d="M12 4v12"/>'),
  x: svg('<path d="M18 6 6 18"/><path d="m6 6 12 12"/>'),
  check: svg('<path d="M20 6 9 17l-5-5"/>'),
  chevronLeft: svg('<path d="m15 18-6-6 6-6"/>'),
  chevronRight: svg('<path d="m9 18 6-6-6-6"/>'),
  chevronDown: svg('<path d="m6 9 6 6 6-6"/>'),
  arrowUp: svg('<path d="M12 19V5"/><path d="m5 12 7-7 7 7"/>'),
  arrowDown: svg('<path d="M12 5v14"/><path d="m19 12-7 7-7-7"/>'),
  grip: svg('<circle cx="9" cy="6" r="1.2"/><circle cx="15" cy="6" r="1.2"/><circle cx="9" cy="12" r="1.2"/><circle cx="15" cy="12" r="1.2"/><circle cx="9" cy="18" r="1.2"/><circle cx="15" cy="18" r="1.2"/>'),
  logout: svg('<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="m16 17 5-5-5-5"/><path d="M21 12H9"/>'),
  menu: svg('<path d="M4 6h16"/><path d="M4 12h16"/><path d="M4 18h16"/>'),
  refresh: svg('<path d="M21 12a9 9 0 1 1-2.6-6.4"/><path d="M21 3v6h-6"/>'),
  external: svg('<path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><path d="M15 3h6v6"/><path d="M10 14 21 3"/>'),
  star: svg('<path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1-5.4-2.9-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z"/>'),
  starFilled: svg('<path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1-5.4-2.9-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z" fill="currentColor"/>'),
  clock: svg('<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3.5 2"/>'),
  alert: svg('<path d="M12 9v4"/><path d="M12 17h.01"/><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/>'),
  link: svg('<path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7"/><path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7"/>'),
  imagePlus: svg('<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="8.5" cy="9.5" r="1.5"/><path d="m21 16-5-5-9 9"/><path d="M17 3v4"/><path d="M15 5h4"/>'),
  file: svg('<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/>'),
  copy: svg('<rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>'),
  spinner: '<svg class="icon spin" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><path d="M12 3a9 9 0 1 0 9 9" /></svg>',
};

/* ------------------------------------------------------------------ */
/* Toasts                                                              */
/* ------------------------------------------------------------------ */

function toastRoot() {
  let root = document.getElementById('toasts');
  if (!root) {
    root = el('<div id="toasts" class="toasts" role="status" aria-live="polite"></div>');
    document.body.appendChild(root);
  }
  return root;
}

export function toast(message, type = 'success', timeout = 3800) {
  const root = toastRoot();
  const item = el(`
    <div class="toast toast-${esc(type)}">
      <span class="toast-icon">${type === 'error' ? icons.alert : icons.check}</span>
      <span class="toast-msg">${esc(message)}</span>
      <button class="toast-close" type="button" aria-label="Dismiss">${icons.x}</button>
    </div>`);
  const remove = () => {
    item.classList.add('toast-leaving');
    setTimeout(() => item.remove(), 220);
  };
  item.querySelector('.toast-close').addEventListener('click', remove);
  root.appendChild(item);
  if (timeout) setTimeout(remove, timeout);
  return item;
}

/* ------------------------------------------------------------------ */
/* Modals                                                              */
/* ------------------------------------------------------------------ */

/**
 * Open a modal dialog. Returns { close, overlay, body }.
 * body: HTMLElement or HTML string. footer: HTMLElement or HTML string.
 */
export function openModal({ title, body, footer = '', wide = false, onClose } = {}) {
  const overlay = el(`
    <div class="modal-overlay" role="presentation">
      <div class="modal ${wide ? 'modal-wide' : ''}" role="dialog" aria-modal="true" aria-label="${esc(title || 'Dialog')}">
        <div class="modal-header">
          <h2 class="modal-title">${esc(title || '')}</h2>
          <button class="icon-btn modal-close" type="button" aria-label="Close dialog">${icons.x}</button>
        </div>
        <div class="modal-body"></div>
        <div class="modal-footer-slot ${footer ? '' : 'hidden'}"></div>
      </div>
    </div>`);
  const bodyEl = overlay.querySelector('.modal-body');
  const footerEl = overlay.querySelector('.modal-footer-slot');
  if (typeof body === 'string') bodyEl.innerHTML = body;
  else if (body) bodyEl.appendChild(body);
  if (typeof footer === 'string') footerEl.innerHTML = footer;
  else if (footer) footerEl.appendChild(footer);

  const close = () => {
    document.removeEventListener('keydown', onKey);
    overlay.classList.add('modal-leaving');
    setTimeout(() => {
      overlay.remove();
      if (typeof onClose === 'function') onClose();
    }, 160);
  };
  const onKey = (e) => {
    if (e.key === 'Escape') close();
  };
  overlay.querySelector('.modal-close').addEventListener('click', close);
  overlay.addEventListener('mousedown', (e) => {
    if (e.target === overlay) close();
  });
  document.addEventListener('keydown', onKey);
  document.body.appendChild(overlay);
  return { close, overlay, body: bodyEl, footer: footerEl };
}

/** Promise-based confirm dialog. */
export function confirmDialog({ title = 'Are you sure?', message = '', confirmLabel = 'Confirm', cancelLabel = 'Cancel', danger = true } = {}) {
  return new Promise((resolve) => {
    const body = el(`<div class="confirm-body"><p>${message}</p></div>`);
    const footer = el(`
      <div class="modal-footer">
        <button class="btn btn-ghost" data-act="cancel" type="button">${esc(cancelLabel)}</button>
        <button class="btn ${danger ? 'btn-danger' : 'btn-primary'}" data-act="ok" type="button">${esc(confirmLabel)}</button>
      </div>`);
    const m = openModal({ title, body, footer });
    let done = false;
    const finish = (val) => {
      if (done) return;
      done = true;
      resolve(val);
      m.close();
    };
    footer.querySelector('[data-act="cancel"]').addEventListener('click', () => finish(false));
    footer.querySelector('[data-act="ok"]').addEventListener('click', () => finish(true));
    m.overlay.addEventListener('mousedown', (e) => {
      if (e.target === m.overlay) finish(false);
    });
  });
}

/* ------------------------------------------------------------------ */
/* Time helpers                                                        */
/* ------------------------------------------------------------------ */

export function timeAgo(iso) {
  if (!iso) return '-';
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '-';
  const secs = Math.max(0, Math.floor((Date.now() - then) / 1000));
  if (secs < 45) return 'just now';
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins} minute${mins === 1 ? '' : 's'} ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days} day${days === 1 ? '' : 's'} ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months} month${months === 1 ? '' : 's'} ago`;
  const years = Math.floor(months / 12);
  return `${years} year${years === 1 ? '' : 's'} ago`;
}

export function formatDate(iso) {
  if (!iso) return '-';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso);
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

export function formatBytes(bytes) {
  const n = Number(bytes) || 0;
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(2)} MB`;
}

/* ------------------------------------------------------------------ */
/* Misc helpers                                                        */
/* ------------------------------------------------------------------ */

export function debounce(fn, ms = 300) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
}

/** Toggle a button's busy state (spinner + disabled). */
export function setBusy(btn, busy, busyLabel = 'Working…') {
  if (!btn) return;
  if (busy) {
    btn.dataset.origHtml = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = `${icons.spinner}<span>${esc(busyLabel)}</span>`;
    btn.classList.add('is-busy');
  } else {
    btn.disabled = false;
    if (btn.dataset.origHtml) btn.innerHTML = btn.dataset.origHtml;
    btn.classList.remove('is-busy');
  }
}

/* ------------------------------------------------------------------ */
/* Markdown rendering                                                  */
/* ------------------------------------------------------------------ */

marked.setOptions({ gfm: true, breaks: false });

/** Strip scripts/event handlers/javascript: URLs from rendered HTML. */
export function sanitizeHtml(html) {
  const doc = new DOMParser().parseFromString(`<div>${html}</div>`, 'text/html');
  const root = doc.body.firstElementChild;
  root.querySelectorAll('script, style, iframe, object, embed, link, meta, form').forEach((n) => n.remove());
  root.querySelectorAll('*').forEach((node) => {
    for (const attr of Array.from(node.attributes)) {
      const name = attr.name.toLowerCase();
      const value = String(attr.value || '').replace(/[\x00-\x20]/g, '').toLowerCase();
      if (name.startsWith('on') || name === 'srcdoc' || name === 'formaction' || name === 'xlink:href') {
        node.removeAttribute(attr.name);
      } else if ((name === 'href' || name === 'src' || name === 'srcset') &&
          (value.startsWith('javascript:') || value.startsWith('data:text/html') || value.startsWith('data:image/svg'))) {
        node.removeAttribute(attr.name);
      }
    }
  });
  return root.innerHTML;
}

export function renderMarkdown(md) {
  if (!md) return '';
  try {
    return sanitizeHtml(marked.parse(String(md)));
  } catch {
    return `<p class="text-muted">Unable to render markdown.</p>`;
  }
}

/* ------------------------------------------------------------------ */
/* States: loading / empty / error                                     */
/* ------------------------------------------------------------------ */

export function loadingSkeleton(rows = 5) {
  let out = '<div class="skeleton-list" aria-hidden="true">';
  for (let i = 0; i < rows; i += 1) {
    out += '<div class="skeleton-row"><div class="skeleton skeleton-thumb"></div><div class="skeleton skeleton-line w-40"></div><div class="skeleton skeleton-line w-20"></div><div class="skeleton skeleton-line w-15"></div></div>';
  }
  return `${out}</div>`;
}

export function emptyState({ title = 'Nothing here yet', message = '', actionLabel = '', icon = 'plus' } = {}) {
  return `
    <div class="empty-state">
      <div class="empty-icon">${icons[icon] || icons.plus}</div>
      <h3>${esc(title)}</h3>
      <p>${esc(message)}</p>
      ${actionLabel ? `<button class="btn btn-primary" data-act="empty-action" type="button">${icons.plus}<span>${esc(actionLabel)}</span></button>` : ''}
    </div>`;
}

export function errorStateHtml(message = 'Something went wrong.') {
  return `
    <div class="error-state">
      <div class="empty-icon">${icons.alert}</div>
      <h3>Something went wrong</h3>
      <p>${esc(message)}</p>
      <button class="btn btn-ghost" data-act="retry" type="button">${icons.refresh}<span>Retry</span></button>
    </div>`;
}

/** Convert a Supabase error into a readable message. */
export function errorMessage(err, fallback = 'Unexpected error.') {
  if (!err) return fallback;
  const msg = err.message || String(err);
  if (/duplicate key|unique constraint/i.test(msg)) return 'A record with this unique value already exists (e.g. duplicate slug).';
  if (/foreign key|violates foreign key/i.test(msg)) return 'This record is still referenced by other entries. Reassign or remove those entries first.';
  if (/row-level security|permission denied|not authorized/i.test(msg)) return 'Not authorized. Your account does not have admin permissions.';
  if (/Failed to fetch|NetworkError|network/i.test(msg)) return 'Network error - check your connection and try again.';
  return msg || fallback;
}
