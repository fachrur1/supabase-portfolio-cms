// admin/src/views/contact.js - contact settings (site_settings) + social links CRUD.
import {
  el, esc, icons, toast, errorMessage, errorStateHtml, loadingSkeleton, setBusy, confirmDialog, timeAgo,
} from '../ui.js';
import { fetchSettings, saveSetting, fetchPage, updateRow, deleteRow, batchOrder, fetchOrdering } from '../api.js';
import { schemas } from '../schemas.js';
import { renderControl, manageCategories } from '../components.js';
import { editInModal } from '../crud.js';

const RE_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const RE_URL = /^https?:\/\/[^\s]+$/i;

export function renderContact(container) {
  container.innerHTML = `
    <div class="page">
      <header class="page-header">
        <div>
          <h1 class="page-title">Contact &amp; Social Links</h1>
          <p class="page-sub">Contact section content and social link buttons</p>
        </div>
      </header>

      <section class="card">
        <h2 class="card-title">${icons.contact}<span>Contact section</span></h2>
        <div class="contact-form-region">${loadingSkeleton(3)}</div>
        <div class="card-footer">
          <button class="btn btn-primary" data-act="save-contact" type="button">${icons.check}<span>Save contact settings</span></button>
        </div>
      </section>

      <section class="card">
        <div class="card-head-row">
          <h2 class="card-title">${icons.link}<span>Social links</span></h2>
          <button class="btn btn-primary btn-sm" data-act="new-link" type="button">${icons.plus}<span>New link</span></button>
        </div>
        <div class="social-region">${loadingSkeleton(3)}</div>
      </section>
    </div>`;

  const contactRegion = container.querySelector('.contact-form-region');
  const socialRegion = container.querySelector('.social-region');

  /* ---------------- contact settings ---------------- */

  let contactControls = null;

  const loadContact = async () => {
    contactRegion.innerHTML = loadingSkeleton(3);
    const { settings, error } = await fetchSettings();
    if (error) {
      contactRegion.innerHTML = errorStateHtml(errorMessage(error, 'Could not load settings.'));
      contactRegion.querySelector('[data-act="retry"]').addEventListener('click', loadContact);
      return;
    }

    const heading = el(`
      <div class="field">
        <label class="field-label">Contact heading</label>
        <div class="field-control"></div>
        <p class="field-error hidden" role="alert"></p>
      </div>`);
    const headingControl = renderControl({ name: 'contact_heading', label: 'Contact heading', type: 'text' }, settings.contact_heading?.value ?? '');
    heading.querySelector('.field-control').appendChild(headingControl);

    const bodyWrap = el(`
      <div class="field field-wide">
        <label class="field-label">Contact body (markdown)</label>
        <div class="field-control"></div>
        <p class="field-error hidden" role="alert"></p>
      </div>`);
    const bodyControl = renderControl({ name: 'contact_body', label: 'Contact body', type: 'markdown', rows: 8 }, settings.contact_body?.value ?? '');
    bodyWrap.querySelector('.field-control').appendChild(bodyControl);

    const email = el(`
      <div class="field">
        <label class="field-label">Contact email</label>
        <div class="field-control"></div>
        <p class="field-help">Validated email address shown in the contact section.</p>
        <p class="field-error hidden" role="alert"></p>
      </div>`);
    const emailControl = renderControl({ name: 'contact_email', label: 'Contact email', type: 'email' }, settings.contact_email?.value ?? '');
    email.querySelector('.field-control').appendChild(emailControl);

    const form = el('<div class="form-grid"></div>');
    form.appendChild(heading);
    form.appendChild(email);
    form.appendChild(bodyWrap);
    contactRegion.innerHTML = '';
    contactRegion.appendChild(form);
    contactControls = { heading: headingControl, body: bodyControl, email: emailControl };
  };

  container.querySelector('[data-act="save-contact"]').addEventListener('click', async (e) => {
    const btn = e.currentTarget;
    if (!contactControls) return;
    const heading = contactControls.heading._getValue();
    const body = contactControls.body._getValue();
    const email = contactControls.email._getValue();

    contactRegion.querySelectorAll('.field').forEach((f) => {
      f.classList.remove('has-error');
      const err = f.querySelector('.field-error');
      if (err) {
        err.classList.add('hidden');
        err.textContent = '';
      }
    });

    if (email && !RE_EMAIL.test(email)) {
      const emailField = contactRegion.querySelectorAll('.field')[1];
      emailField.classList.add('has-error');
      const errEl = emailField.querySelector('.field-error');
      errEl.textContent = 'Contact email must be a valid email address.';
      errEl.classList.remove('hidden');
      toast('Please fix the highlighted fields.', 'error');
      return;
    }

    setBusy(btn, true, 'Saving…');
    const results = await Promise.all([
      saveSetting('contact_heading', heading, 'Contact section heading'),
      saveSetting('contact_body', body, 'Contact section body (markdown)'),
      saveSetting('contact_email', email, 'Contact email address'),
    ]);
    setBusy(btn, false);
    const failed = results.find((r) => r.error);
    if (failed) {
      toast(errorMessage(failed.error, 'Could not save contact settings.'), 'error');
      return;
    }
    toast('Contact settings saved.');
  });

  /* ---------------- social links ---------------- */

  const loadSocial = async () => {
    socialRegion.innerHTML = loadingSkeleton(3);
    const [page, ordering] = await Promise.all([
      fetchPage({ table: 'social_links', sort: { key: 'sort_order', dir: 'asc' }, page: 1, perPage: 100 }),
      fetchOrdering('social_links', 'sort_order'),
    ]);
    if (page.error) {
      socialRegion.innerHTML = errorStateHtml(errorMessage(page.error, 'Could not load social links.'));
      socialRegion.querySelector('[data-act="retry"]').addEventListener('click', loadSocial);
      return;
    }
    const rows = page.rows;
    if (!rows.length) {
      socialRegion.innerHTML = `
        <div class="empty-state">
          <div class="empty-icon">${icons.link}</div>
          <h3>No social links yet</h3>
          <p>Add the links shown in your footer and contact section.</p>
        </div>`;
      return;
    }

    socialRegion.innerHTML = `
      <div class="table-wrap">
        <table class="data-table">
          <thead>
            <tr>
              <th class="cell-grip"></th>
              <th>Platform</th><th>Label</th><th>URL</th><th>Visible</th><th>Updated</th>
              <th class="cell-actions">Actions</th>
            </tr>
          </thead>
          <tbody>
            ${rows.map((row) => `
              <tr draggable="true" data-id="${esc(row.id)}">
                <td class="cell-grip" title="Drag to reorder">${icons.grip}</td>
                <td><span class="badge badge-table">${esc(row.platform)}</span></td>
                <td class="cell-title"><span class="row-title">${esc(row.label || row.platform)}</span></td>
                <td class="cell-url"><a href="${esc(row.url)}" target="_blank" rel="noopener">${esc(row.url)}</a></td>
                <td>
                  <button class="btn btn-ghost btn-sm" data-action="visible" type="button">
                    ${row.visible ? icons.check : icons.x}<span>${row.visible ? 'Visible' : 'Hidden'}</span>
                  </button>
                </td>
                <td>${esc(timeAgo(row.updated_at))}</td>
                <td class="cell-actions">
                  <div class="row-actions">
                    <button class="icon-btn" data-action="edit" title="Edit" aria-label="Edit">${icons.edit}</button>
                    <button class="icon-btn danger" data-action="delete" title="Delete" aria-label="Delete">${icons.trash}</button>
                  </div>
                  <div class="order-buttons">
                    <button class="icon-btn" data-action="up" title="Move up" aria-label="Move up">${icons.arrowUp}</button>
                    <button class="icon-btn" data-action="down" title="Move down" aria-label="Move down">${icons.arrowDown}</button>
                  </div>
                </td>
              </tr>`).join('')}
          </tbody>
        </table>
      </div>`;

    const ids = ordering.rows.map((o) => o.id);
    const persist = async (newIds) => {
      const changed = [];
      newIds.forEach((id, index) => {
        const prev = ordering.rows.find((o) => o.id === id);
        if (!prev || prev.sort_order !== index) changed.push({ id, value: index });
      });
      if (!changed.length) return;
      const { error } = await batchOrder('social_links', changed, 'sort_order');
      if (error) toast(errorMessage(error), 'error');
      await loadSocial();
    };

    socialRegion.querySelectorAll('tr[data-id]').forEach((tr) => {
      const id = tr.dataset.id;
      const row = rows.find((r) => r.id === id);

      tr.querySelectorAll('[data-action]').forEach((btn) => {
        btn.addEventListener('click', async () => {
          const action = btn.dataset.action;
          if (action === 'edit') {
            editInModal(schemas.social_links, row, {
              onSave: loadSocial,
              validateExtra: (values) => {
                const url = String(values.url || '');
                if (values.platform === 'email') {
                  return RE_URL.test(url) || /^mailto:[^\s]+$/i.test(url) ? {} : { url: 'Use an https:// URL or a mailto: link for email.' };
                }
                return RE_URL.test(url) ? {} : { url: 'URL must start with https://' };
              },
            });
          } else if (action === 'delete') {
            const ok = await confirmDialog({
              title: 'Delete social link?',
              message: `Delete <strong>${esc(row.label || row.platform)}</strong>?`,
              confirmLabel: 'Delete',
            });
            if (!ok) return;
            const { error } = await deleteRow('social_links', id);
            if (error) toast(errorMessage(error), 'error');
            else {
              toast('Social link deleted.');
              loadSocial();
            }
          } else if (action === 'visible') {
            const { error } = await updateRow('social_links', id, { visible: !row.visible });
            if (error) toast(errorMessage(error), 'error');
            else loadSocial();
          } else if (action === 'up' || action === 'down') {
            const index = ids.indexOf(id);
            const swapIndex = action === 'up' ? index - 1 : index + 1;
            if (swapIndex < 0 || swapIndex >= ids.length) return;
            const next = ids.slice();
            [next[index], next[swapIndex]] = [next[swapIndex], next[index]];
            await persist(next);
          }
        });
      });

      tr.addEventListener('dragstart', (e) => {
        tr.classList.add('dragging');
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', id);
      });
      tr.addEventListener('dragend', () => tr.classList.remove('dragging'));
      tr.addEventListener('dragover', (e) => {
        e.preventDefault();
        tr.classList.add('drag-over');
      });
      tr.addEventListener('dragleave', () => tr.classList.remove('drag-over'));
      tr.addEventListener('drop', async (e) => {
        e.preventDefault();
        tr.classList.remove('drag-over');
        const draggedId = e.dataTransfer.getData('text/plain');
        if (!draggedId || draggedId === id) return;
        const next = ids.slice();
        const from = next.indexOf(draggedId);
        next.splice(from, 1);
        next.splice(next.indexOf(id), 0, draggedId);
        await persist(next);
      });
    });
  };

  container.querySelector('[data-act="new-link"]').addEventListener('click', () => {
    editInModal(schemas.social_links, { platform: 'website', visible: true, sort_order: 0 }, {
      onSave: loadSocial,
      validateExtra: (values) => {
        const url = String(values.url || '');
        if (values.platform === 'email') {
          return RE_URL.test(url) || /^mailto:[^\s]+$/i.test(url) ? {} : { url: 'Use an https:// URL or a mailto: link for email.' };
        }
        return RE_URL.test(url) ? {} : { url: 'URL must start with https://' };
      },
    });
  });

  loadContact();
  loadSocial();
}
