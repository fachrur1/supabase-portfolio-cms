// admin/src/views/settings.js - site_settings key/value editor + site_images media slots.
import {
  el, esc, icons, toast, openModal, confirmDialog, errorMessage, errorStateHtml,
  loadingSkeleton, setBusy, timeAgo,
} from '../ui.js';
import { supabase, fetchSettings, saveSetting, fetchSiteImages, updateRow, deleteRow } from '../api.js';
import { schemas } from '../schemas.js';
import { renderControl } from '../components.js';
import { buildForm, buildPayload } from '../crud.js';

const KNOWN_SETTINGS = [
  {
    key: 'text_alignment',
    label: 'Body text alignment',
    type: 'select',
    options: [
      { value: 'text-justify', label: 'Justified' },
      { value: 'text-left', label: 'Left aligned' },
    ],
  },
  { key: 'site_title', label: 'Site title', type: 'text' },
  { key: 'meta_description', label: 'Meta description (SEO)', type: 'textarea', rows: 3 },
  { key: 'photography_heading', label: 'Photography heading', type: 'text' },
  { key: 'photography_description', label: 'Photography description', type: 'textarea', rows: 4 },
];

export function renderSettings(container) {
  container.innerHTML = `
    <div class="page">
      <header class="page-header">
        <div>
          <h1 class="page-title">Website Settings</h1>
          <p class="page-sub">Global site options, key/value settings and named media slots</p>
        </div>
      </header>

      <section class="card">
        <h2 class="card-title">${icons.settings}<span>Site options</span></h2>
        <div class="known-region">${loadingSkeleton(3)}</div>
        <div class="card-footer">
          <button class="btn btn-primary" data-act="save-known" type="button">${icons.check}<span>Save options</span></button>
        </div>
      </section>

      <section class="card">
        <div class="card-head-row">
          <h2 class="card-title">${icons.copy}<span>All settings (key / value)</span></h2>
          <button class="btn btn-primary btn-sm" data-act="new-setting" type="button">${icons.plus}<span>New setting</span></button>
        </div>
        <div class="settings-region">${loadingSkeleton(3)}</div>
      </section>

      <section class="card">
        <div class="card-head-row">
          <h2 class="card-title">${icons.gallery}<span>Media slots</span></h2>
          <button class="btn btn-primary btn-sm" data-act="new-image" type="button">${icons.plus}<span>New media slot</span></button>
        </div>
        <div class="images-region">${loadingSkeleton(3)}</div>
      </section>
    </div>`;

  const knownRegion = container.querySelector('.known-region');
  const settingsRegion = container.querySelector('.settings-region');
  const imagesRegion = container.querySelector('.images-region');
  let knownControls = null;

  /* ---------------- known site options ---------------- */

  const loadKnown = async () => {
    knownRegion.innerHTML = loadingSkeleton(3);
    const { settings, error } = await fetchSettings();
    if (error) {
      knownRegion.innerHTML = errorStateHtml(errorMessage(error, 'Could not load settings.'));
      knownRegion.querySelector('[data-act="retry"]').addEventListener('click', loadKnown);
      return;
    }
    knownControls = {};
    const grid = el('<div class="form-grid"></div>');
    for (const def of KNOWN_SETTINGS) {
      const value = settings[def.key]?.value ?? '';
      const wrap = el(`
        <div class="field ${def.type === 'textarea' ? 'field-wide' : ''}">
          <label class="field-label">${esc(def.label)}</label>
          <div class="field-control"></div>
          <p class="field-help">Stored in <code>site_settings</code> as <code>${esc(def.key)}</code>.</p>
        </div>`);
      const control = renderControl(
        { name: def.key, label: def.label, type: def.type, options: def.options, rows: def.rows },
        value
      );
      wrap.querySelector('.field-control').appendChild(control);
      knownControls[def.key] = control;
      grid.appendChild(wrap);
    }
    knownRegion.innerHTML = '';
    knownRegion.appendChild(grid);
  };

  container.querySelector('[data-act="save-known"]').addEventListener('click', async (e) => {
    const btn = e.currentTarget;
    if (!knownControls) return;
    setBusy(btn, true, 'Saving…');
    const results = await Promise.all(
      KNOWN_SETTINGS.map((def) => saveSetting(def.key, knownControls[def.key]._getValue(), def.label))
    );
    setBusy(btn, false);
    const failed = results.find((r) => r.error);
    if (failed) {
      toast(errorMessage(failed.error, 'Could not save settings.'), 'error');
      return;
    }
    toast('Site options saved.');
  });

  /* ---------------- key/value settings table ---------------- */

  const loadSettings = async () => {
    settingsRegion.innerHTML = loadingSkeleton(3);
    const { settings, error } = await fetchSettings();
    if (error) {
      settingsRegion.innerHTML = errorStateHtml(errorMessage(error, 'Could not load settings.'));
      settingsRegion.querySelector('[data-act="retry"]').addEventListener('click', loadSettings);
      return;
    }
    const rows = Object.values(settings);
    if (!rows.length) {
      settingsRegion.innerHTML = '<p class="text-muted">No settings rows yet.</p>';
      return;
    }
    settingsRegion.innerHTML = `
      <div class="table-wrap">
        <table class="data-table">
          <thead><tr><th>Key</th><th>Label</th><th>Value</th><th>Updated</th><th class="cell-actions">Actions</th></tr></thead>
          <tbody>
            ${rows.map((row) => `
              <tr data-key="${esc(row.key)}">
                <td class="cell-title"><span class="row-title"><code>${esc(row.key)}</code></span></td>
                <td>${esc(row.label || '-')}</td>
                <td class="cell-url">${esc(JSON.stringify(row.value).slice(0, 70))}</td>
                <td>${esc(timeAgo(row.updated_at))}</td>
                <td class="cell-actions">
                  <div class="row-actions">
                    <button class="icon-btn" data-action="edit" title="Edit" aria-label="Edit">${icons.edit}</button>
                    <button class="icon-btn danger" data-action="delete" title="Delete" aria-label="Delete">${icons.trash}</button>
                  </div>
                </td>
              </tr>`).join('')}
          </tbody>
        </table>
      </div>`;

    settingsRegion.querySelectorAll('tr[data-key]').forEach((tr) => {
      const key = tr.dataset.key;
      const row = rows.find((r) => r.key === key);
      tr.querySelector('[data-action="edit"]').addEventListener('click', () => openSettingModal(row, loadSettings));
      tr.querySelector('[data-action="delete"]').addEventListener('click', async () => {
        const ok = await confirmDialog({
          title: 'Delete setting?',
          message: `Delete the setting <strong>${esc(key)}</strong>? The public site may fall back to defaults.`,
          confirmLabel: 'Delete',
        });
        if (!ok) return;
        const { error: delError } = await supabase.from('site_settings').delete().eq('key', key);
        if (delError) toast(errorMessage(delError), 'error');
        else {
          toast('Setting deleted.');
          loadSettings();
        }
      });
    });
  };

  container.querySelector('[data-act="new-setting"]').addEventListener('click', () => openSettingModal(null, loadSettings));

  /* ---------------- media slots ---------------- */

  const loadImages = async () => {
    imagesRegion.innerHTML = loadingSkeleton(3);
    const { rows, error } = await fetchSiteImages();
    if (error) {
      imagesRegion.innerHTML = errorStateHtml(errorMessage(error, 'Could not load media slots.'));
      imagesRegion.querySelector('[data-act="retry"]').addEventListener('click', loadImages);
      return;
    }
    if (!rows.length) {
      imagesRegion.innerHTML = `
        <div class="empty-state">
          <div class="empty-icon">${icons.gallery}</div>
          <h3>No media slots yet</h3>
          <p>Media slots are named images the public site references by key (e.g. <code>profile_image</code>).</p>
        </div>`;
      return;
    }
    imagesRegion.innerHTML = `
      <div class="table-wrap">
        <table class="data-table">
          <thead><tr><th>Preview</th><th>Key</th><th>Alt</th><th>Caption</th><th>Updated</th><th class="cell-actions">Actions</th></tr></thead>
          <tbody>
            ${rows.map((row) => `
              <tr data-key="${esc(row.key)}">
                <td>${row.url ? `<img class="row-thumb" src="${esc(row.url)}" alt="${esc(row.alt || '')}" />` : `<span class="row-thumb row-thumb-empty">${icons.imagePlus}</span>`}</td>
                <td class="cell-title"><span class="row-title"><code>${esc(row.key)}</code></span></td>
                <td>${esc(row.alt || '-')}</td>
                <td>${esc(row.caption || '-')}</td>
                <td>${esc(timeAgo(row.updated_at))}</td>
                <td class="cell-actions">
                  <div class="row-actions">
                    <button class="icon-btn" data-action="edit" title="Edit" aria-label="Edit">${icons.edit}</button>
                    <button class="icon-btn danger" data-action="delete" title="Delete" aria-label="Delete">${icons.trash}</button>
                  </div>
                </td>
              </tr>`).join('')}
          </tbody>
        </table>
      </div>`;

    imagesRegion.querySelectorAll('tr[data-key]').forEach((tr) => {
      const key = tr.dataset.key;
      const row = rows.find((r) => r.key === key);
      tr.querySelector('[data-action="edit"]').addEventListener('click', () => openImageModal(row, loadImages));
      tr.querySelector('[data-action="delete"]').addEventListener('click', async () => {
        const ok = await confirmDialog({
          title: 'Delete media slot?',
          message: `Delete the media slot <strong>${esc(key)}</strong>?`,
          confirmLabel: 'Delete',
        });
        if (!ok) return;
        const { error: delError } = await supabase.from('site_images').delete().eq('key', key);
        if (delError) toast(errorMessage(delError), 'error');
        else {
          toast('Media slot deleted.');
          loadImages();
        }
      });
    });
  };

  container.querySelector('[data-act="new-image"]').addEventListener('click', () => openImageModal(null, loadImages));

  loadKnown();
  loadSettings();
  loadImages();
}

/* ------------------------------------------------------------------ */
/* Setting key/value modal                                             */
/* ------------------------------------------------------------------ */

function openSettingModal(existing, reload) {
  const isNew = !existing;
  const body = el(`
    <div class="schema-form">
      <div class="form-section">
        <div class="form-grid">
          <div class="field">
            <label class="field-label">Key${isNew ? '<span class="req">*</span>' : ''}</label>
            <div class="field-control"><input class="input" name="key" type="text" value="${esc(existing?.key || '')}" ${isNew ? '' : 'disabled'} placeholder="e.g. footer_note" /></div>
            <p class="field-help">${isNew ? 'Immutable identifier (a-z, 0-9, underscore).' : 'The key cannot be changed after creation.'}</p>
            <p class="field-error hidden" role="alert"></p>
          </div>
          <div class="field">
            <label class="field-label">Label</label>
            <div class="field-control"><input class="input" name="label" type="text" value="${esc(existing?.label || '')}" /></div>
          </div>
          <div class="field field-wide">
            <label class="field-label">Value (JSON or plain text)</label>
            <div class="field-control"><textarea class="textarea" name="value" rows="5">${esc(existing ? JSON.stringify(existing.value, null, 2) : '')}</textarea></div>
            <p class="field-help">Valid JSON is stored as-is (e.g. <code>"text-justify"</code>, <code>{"a": 1}</code>). Plain text is stored as a JSON string.</p>
            <p class="field-error hidden" role="alert"></p>
          </div>
        </div>
      </div>
    </div>`);
  const footer = el(`
    <div class="modal-footer">
      <button class="btn btn-ghost" data-act="cancel" type="button">Cancel</button>
      <button class="btn btn-primary" data-act="save" type="button">${icons.check}<span>Save</span></button>
    </div>`);
  const modal = openModal({ title: isNew ? 'New setting' : `Edit: ${existing.key}`, body, footer, wide: true });
  footer.querySelector('[data-act="cancel"]').addEventListener('click', modal.close);

  footer.querySelector('[data-act="save"]').addEventListener('click', async (e) => {
    const btn = e.currentTarget;
    const keyInput = body.querySelector('[name="key"]');
    const key = (existing?.key || keyInput.value.trim());
    const label = body.querySelector('[name="label"]').value.trim();
    const raw = body.querySelector('[name="value"]').value.trim();

    body.querySelectorAll('.field').forEach((f) => {
      f.classList.remove('has-error');
      const err = f.querySelector('.field-error');
      if (err) {
        err.classList.add('hidden');
        err.textContent = '';
      }
    });
    const fail = (fieldIndex, msg) => {
      const field = body.querySelectorAll('.field')[fieldIndex];
      field.classList.add('has-error');
      const errEl = field.querySelector('.field-error');
      errEl.textContent = msg;
      errEl.classList.remove('hidden');
    };

    if (isNew && !key) {
      fail(0, 'Key is required.');
      toast('Please fix the highlighted fields.', 'error');
      return;
    }
    if (isNew && !/^[a-z0-9_]+$/.test(key)) {
      fail(0, 'Key may only contain a-z, 0-9 and underscores.');
      toast('Please fix the highlighted fields.', 'error');
      return;
    }

    let value;
    try {
      value = JSON.parse(raw);
    } catch {
      value = raw;
    }

    setBusy(btn, true, 'Saving…');
    const { error } = await saveSetting(key, value, label);
    setBusy(btn, false);
    if (error) {
      toast(errorMessage(error, 'Could not save the setting.'), 'error');
      return;
    }
    toast('Setting saved.');
    modal.close();
    reload();
  });
}

/* ------------------------------------------------------------------ */
/* Media slot modal                                                    */
/* ------------------------------------------------------------------ */

function openImageModal(existing, reload) {
  const isNew = !existing;
  const form = buildForm(schemas.site_images, existing || {}, [], {});
  if (!isNew) {
    const keyControl = form.controls.get('key');
    if (keyControl && keyControl.control._input) keyControl.control._input.disabled = true;
  }
  const footer = el(`
    <div class="modal-footer">
      <button class="btn btn-ghost" data-act="cancel" type="button">Cancel</button>
      <button class="btn btn-primary" data-act="save" type="button">${icons.check}<span>Save</span></button>
    </div>`);
  const modal = openModal({ title: isNew ? 'New media slot' : `Edit: ${existing.key}`, body: form.root, footer, wide: true });
  footer.querySelector('[data-act="cancel"]').addEventListener('click', modal.close);

  footer.querySelector('[data-act="save"]').addEventListener('click', async (e) => {
    const btn = e.currentTarget;
    const result = form.validate();
    if (!result.ok) {
      toast('Please fix the highlighted fields.', 'error');
      return;
    }
    setBusy(btn, true, 'Saving…');
    const { values } = form.collect();
    const payload = {
      key: existing?.key || values.key.trim(),
      url: values.url || '',
      alt: values.alt || '',
      caption: values.caption || '',
    };
    let response;
    if (isNew) {
      response = await supabase.from('site_images').insert(payload).select().single();
    } else {
      response = await supabase.from('site_images').update({
        url: payload.url,
        alt: payload.alt,
        caption: payload.caption,
      }).eq('key', payload.key).select().single();
    }
    setBusy(btn, false);
    if (response.error) {
      toast(errorMessage(response.error, 'Could not save the media slot.'), 'error');
      return;
    }
    toast('Media slot saved.');
    modal.close();
    reload();
  });
}
