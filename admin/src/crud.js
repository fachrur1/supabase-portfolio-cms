// admin/src/crud.js - schema-driven list + form engine used by every module.
import {
  el, esc, icons, toast, openModal, confirmDialog, setBusy, timeAgo, formatDate,
  debounce, loadingSkeleton, emptyState, errorStateHtml, errorMessage, renderMarkdown, qs,
} from './ui.js';
import {
  fetchPage, getRow, createRow, updateRow, deleteRow, batchOrder, fetchOrdering,
  listCategories, listProjectMedia, syncProjectMedia,
} from './api.js';
import { renderControl, slugify, manageCategories } from './components.js';
import { buildPayload } from './payload.js';
import {
  readDraft as readDraftFor, writeDraft as writeDraftFor, clearDraft as clearDraftFor,
  rowFromValues, describeDraft,
} from './drafts.js';
export { buildPayload } from './payload.js';

/* ------------------------------------------------------------------ */
/* Validation                                                          */
/* ------------------------------------------------------------------ */

const RE_URL = /^https?:\/\/[^\s]+$/i;
const RE_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const RE_SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** Validate a single field value. Returns an error message or null. */
export function validateField(field, value) {
  const label = field.label || field.name;
  const empty = value === null || value === undefined || value === ''
    || (Array.isArray(value) && value.length === 0);

  if (field.required && empty) return `${label} is required.`;
  if (empty) return null;

  switch (field.type) {
    case 'url':
      if (!RE_URL.test(String(value))) return `${label} must be a valid http(s) URL.`;
      break;
    case 'video':
      // Uploaded files resolve to an absolute Storage URL; pasted links too.
      if (!RE_URL.test(String(value))) return `${label} must be a valid http(s) URL - upload a file or paste a link.`;
      break;
    case 'email':
      if (!RE_EMAIL.test(String(value))) return `${label} must be a valid email address.`;
      break;
    case 'image': {
      const s = String(value);
      if (/\s/.test(s)) return `${label} must not contain spaces.`;
      if (s.includes('://') && !/^https?:\/\//i.test(s)) return `${label} must be an http(s) URL.`;
      break;
    }
    case 'slug':
      if (!RE_SLUG.test(String(value))) return `${label} may only contain a-z, 0-9 and single hyphens (e.g. my-project).`;
      break;
    case 'number': {
      const n = Number(value);
      if (Number.isNaN(n)) return `${label} must be a number.`;
      if (field.min !== undefined && n < field.min) return `${label} must be ≥ ${field.min}.`;
      if (field.max !== undefined && n > field.max) return `${label} must be ≤ ${field.max}.`;
      break;
    }
    case 'links': {
      for (const item of value) {
        if (item.url && !RE_URL.test(String(item.url))) return `Every ${label.toLowerCase()} entry needs a valid http(s) URL.`;
      }
      break;
    }
    case 'gallery': {
      for (const item of value) {
        if (!item.url || !String(item.url).trim()) return `Every ${label.toLowerCase()} item needs an image URL.`;
      }
      break;
    }
    default:
      break;
  }
  return null;
}

/* ------------------------------------------------------------------ */
/* Form engine                                                         */
/* ------------------------------------------------------------------ */

/**
 * Build a form from a schema config.
 * Returns { root, collect, validate, setErrors, destroy }.
 * hooks: { onChange(), validateExtra(values) -> {field: msg} }
 */
export function buildForm(config, row = {}, categories = [], hooks = {}) {
  const values0 = { ...(config.defaults || {}), ...row };
  const controls = new Map();
  const root = el('<form class="schema-form" novalidate></form>');

  const sections = config.sections || ['Basic'];
  for (const sectionName of sections) {
    const fields = config.fields.filter(
      (f) => (f.section === sectionName || f.sectionOverride === sectionName)
    );
    if (!fields.length) continue;
    const fs = el(`
      <fieldset class="form-section">
        <legend>${esc(sectionName)}</legend>
        <div class="form-grid"></div>
      </fieldset>`);
    const grid = fs.querySelector('.form-grid');

    for (const field of fields) {
      const isWide = ['markdown', 'gallery', 'links', 'tags', 'textarea', 'image', 'video'].includes(field.type);
      const wrap = el(`
        <div class="field ${isWide ? 'field-wide' : ''}" data-field="${esc(field.name)}">
          <label class="field-label" for="">${esc(field.label)}${field.required ? '<span class="req" aria-hidden="true">*</span>' : ''}</label>
          <div class="field-control"></div>
          ${field.help ? `<p class="field-help">${esc(field.help)}</p>` : ''}
          <p class="field-error hidden" role="alert"></p>
        </div>`);
      const control = renderControl(field, values0[field.name], { config, categories });
      wrap.querySelector('.field-control').appendChild(control);
      controls.set(field.name, { field, control, wrap });
      grid.appendChild(wrap);
    }
    root.appendChild(fs);
  }

  /* --- inter-field behaviours ------------------------------------- */

  // Slug auto-generation from the configured source field.
  const slugCfg = config.slugField ? config.fields.find((f) => f.type === 'slug') : null;
  const slugEntry = slugCfg ? controls.get(slugCfg.name) : null;
  const sourceEntry = config.slugSource ? controls.get(config.slugSource) : null;
  if (slugEntry && sourceEntry && slugEntry.control._input && sourceEntry.control._input) {
    const slugInput = slugEntry.control._input;
    const sourceInput = sourceEntry.control._input;
    let slugManual = Boolean(values0[slugCfg.name]);
    slugInput.addEventListener('input', () => {
      slugManual = true;
    });
    sourceInput.addEventListener('input', () => {
      if (!slugManual) {
        slugInput.value = slugify(sourceInput.value);
        slugInput.dispatchEvent(new Event('input', { bubbles: true }));
      }
    });
  }

  // currently_working disables end_date.
  const cw = controls.get('currently_working');
  const endDate = controls.get('end_date');
  if (cw && endDate && endDate.control._input) {
    const sync = () => {
      const checked = cw.control.querySelector('input').checked;
      endDate.control._input.disabled = checked;
      endDate.wrap.classList.toggle('field-disabled', checked);
      if (checked) endDate.control._input.value = '';
    };
    cw.control.querySelector('input').addEventListener('change', sync);
    sync();
  }

  // Dirty tracking.
  root.addEventListener('input', () => {
    if (typeof hooks.onChange === 'function') hooks.onChange();
  });
  root.addEventListener('change', () => {
    if (typeof hooks.onChange === 'function') hooks.onChange();
  });

  /* --- API --------------------------------------------------------- */

  const collect = () => {
    const values = {};
    let media = null;
    for (const [name, { field, control }] of controls) {
      const value = control._getValue ? control._getValue() : null;
      if (name === '__project_media') {
        media = value;
        continue;
      }
      values[name] = value;
    }
    return { values, media };
  };

  const setErrors = (errors) => {
    for (const [name, { wrap }] of controls) {
      const errEl = wrap.querySelector('.field-error');
      const msg = errors[name];
      if (msg) {
        errEl.textContent = msg;
        errEl.classList.remove('hidden');
        wrap.classList.add('has-error');
        const input = wrap.querySelector('input, textarea, select');
        if (input) input.setAttribute('aria-invalid', 'true');
      } else {
        errEl.textContent = '';
        errEl.classList.add('hidden');
        wrap.classList.remove('has-error');
        const input = wrap.querySelector('input, textarea, select');
        if (input) input.removeAttribute('aria-invalid');
      }
    }
  };

  const validate = () => {
    const { values } = collect();
    const errors = {};
    for (const [name, { field }] of controls) {
      if (name === '__project_media') continue;
      const msg = validateField(field, values[name]);
      if (msg) errors[name] = msg;
    }
    if (typeof hooks.validateExtra === 'function') {
      Object.assign(errors, hooks.validateExtra(values) || {});
    }
    setErrors(errors);
    return { ok: !Object.values(errors).some(Boolean), errors, values };
  };

  return { root, collect, validate, setErrors, controls };
}

/** Insert or update a row (plus project media sync when configured). */
export async function saveRow(config, values, media, existingId) {
  const payload = buildPayload(config, values);
  let result;
  if (existingId) {
    result = await updateRow(config.table, existingId, payload);
  } else {
    result = await createRow(config.table, payload);
  }
  if (result.error) return { row: null, error: result.error };
  if (config.mediaTable && result.row && Array.isArray(media)) {
    const { error: mediaError } = await syncProjectMedia(result.row.id, media);
    if (mediaError) return { row: result.row, error: mediaError };
  }
  return { row: result.row, error: null };
}

/* ------------------------------------------------------------------ */
/* Preview modal                                                       */
/* ------------------------------------------------------------------ */

export function previewModal(config, values, categories = []) {
  const catName = (id) => (categories.find((c) => c.id === id) || {}).name || '';
  const title = values[config.titleField]
    || (config.titleFallback ? values[config.titleFallback] : '')
    || '(untitled)';
  const subtitle = config.titleFallback && !values[config.titleField]
    ? values[config.titleFallback]
    : '';

  const metaBits = [];
  if (values.status) metaBits.push(`<span class="badge badge-${esc(values.status)}">${esc(values.status)}</span>`);
  const catField = config.fields.find((f) => f.optionsFromCategories);
  if (catField && values[catField.name] && catName(values[catField.name])) {
    metaBits.push(`<span class="meta-chip">${esc(catName(values[catField.name]))}</span>`);
  }
  for (const key of ['start_date', 'completion_date', 'graduation_date', 'capture_date', 'end_date']) {
    if (values[key]) metaBits.push(`<span class="meta-chip">${esc(formatDate(values[key]))}</span>`);
  }
  if (values.location) metaBits.push(`<span class="meta-chip">${esc(values.location)}</span>`);

  let mediaHtml = '';
  const imageFields = config.fields.filter((f) => f.type === 'image' && values[f.name]);
  if (imageFields.length) {
    mediaHtml += '<div class="preview-media">';
    for (const f of imageFields) {
      mediaHtml += `<figure><img src="${esc(values[f.name])}" alt="${esc(values[f.name + '_alt'] || values.alt_text || f.label || '')}" /><figcaption>${esc(f.label)}</figcaption></figure>`;
    }
    mediaHtml += '</div>';
  }

  const galleryField = config.fields.find((f) => f.type === 'gallery');
  const rawGallery = galleryField
    ? (values[galleryField.name] ?? (galleryField.name.startsWith('__') ? values.__media : null))
    : null;
  const galleryItems = Array.isArray(rawGallery) ? rawGallery : [];
  if (galleryItems.length) {
    mediaHtml += '<div class="preview-media">';
    for (const item of galleryItems) {
      mediaHtml += `<figure><img src="${esc(item.url)}" alt="${esc(item.alt || '')}" />${item.caption ? `<figcaption>${esc(item.caption)}</figcaption>` : ''}</figure>`;
    }
    mediaHtml += '</div>';
  }

  let bodyHtml = '';
  for (const sectionName of config.sections || ['Basic']) {
    const fields = (config.fields || []).filter(
      (f) => f.section === sectionName && !f.name.startsWith('__') && f.name !== config.titleField
        && f.type !== 'image' && f.type !== 'gallery' && f.type !== 'checkbox'
        && f.name !== 'status' && f.name !== 'sort_order' && f.name !== 'display_order' && f.name !== 'display_priority'
    );
    const parts = [];
    for (const f of fields) {
      const value = values[f.name];
      const empty = value === null || value === undefined || value === '' || (Array.isArray(value) && !value.length);
      if (empty) continue;
      if (f.type === 'markdown') {
        parts.push(`<h3 class="preview-sub">${esc(f.label)}</h3><div class="prose">${renderMarkdown(value)}</div>`);
      } else if (f.type === 'tags') {
        parts.push(`<p class="preview-tags">${value.map((t) => `<span class="tag-chip">${esc(t)}</span>`).join('')}</p>`);
      } else if (f.type === 'links') {
        parts.push(`<ul class="preview-links">${value.map((l) => `<li><a href="${esc(l.url)}" target="_blank" rel="noopener">${esc(l.label || l.url)}</a></li>`).join('')}</ul>`);
      } else if (f.type === 'select') {
        parts.push(`<p class="preview-row"><strong>${esc(f.label)}:</strong> ${esc(value)}</p>`);
      } else if (f.type === 'date') {
        parts.push(`<p class="preview-row"><strong>${esc(f.label)}:</strong> ${esc(formatDate(value))}</p>`);
      } else {
        parts.push(`<p class="preview-row"><strong>${esc(f.label)}:</strong> ${esc(value)}</p>`);
      }
    }
    if (parts.length) {
      bodyHtml += `<section class="preview-section"><h2 class="preview-heading">${esc(sectionName)}</h2>${parts.join('')}</section>`;
    }
  }

  const body = el(`
    <div class="preview-entry">
      <h1 class="preview-title">${esc(title)}</h1>
      ${subtitle ? `<p class="preview-subtitle">${esc(subtitle)}</p>` : ''}
      <div class="preview-meta">${metaBits.join('')}</div>
      ${mediaHtml}
      ${bodyHtml}
    </div>`);
  return openModal({ title: 'Preview', body, wide: true });
}

/* ------------------------------------------------------------------ */
/* Shared row helpers                                                  */
/* ------------------------------------------------------------------ */

export function entryName(config, row) {
  const primary = row[config.titleField];
  if (primary) return primary;
  if (config.titleFallback && row[config.titleFallback]) return row[config.titleFallback];
  return '(untitled)';
}

function categoryName(categories, id) {
  return (categories.find((c) => c.id === id) || {}).name || '-';
}

/* ------------------------------------------------------------------ */
/* List page engine                                                    */
/* ------------------------------------------------------------------ */

export function renderListPage(container, config, navigate, { hideHeader = false } = {}) {
  const state = {
    search: '',
    status: 'all',
    category: 'all',
    sort: { key: 'updated_at', dir: 'desc' },
    page: 1,
    perPage: 10,
    rows: [],
    count: 0,
    categories: [],
    ordering: [],
    loading: true,
    error: null,
  };

  container.innerHTML = `
    <div class="page">
      ${hideHeader ? '' : `
      <header class="page-header">
        <div>
          <h1 class="page-title">${esc(config.label)}</h1>
          <p class="page-sub">${state.count} entries</p>
        </div>
        <button class="btn btn-primary" data-act="new" type="button">${icons.plus}<span>New ${esc(config.singular)}</span></button>
      </header>`}
      <div class="toolbar">
        <div class="search-box">
          <span class="search-icon">${icons.search}</span>
          <input class="input" type="search" data-act="search" placeholder="Search ${esc(config.label.toLowerCase())}…" aria-label="Search" />
        </div>
        <select class="select" data-act="status" aria-label="Filter by status">
          <option value="all">All statuses</option>
          <option value="published">Published</option>
          <option value="draft">Draft</option>
        </select>
        ${config.categoryKind ? `
          <select class="select" data-act="category" aria-label="Filter by category">
            <option value="all">All categories</option>
          </select>
          <button class="btn btn-ghost btn-sm" data-act="manage-cats" type="button">${icons.settings}<span>Manage categories</span></button>
        ` : ''}
      </div>
      <div class="list-region"></div>
      <nav class="pagination" aria-label="Pagination"></nav>
    </div>`;

  const listRegion = container.querySelector('.list-region');
  const paginationEl = container.querySelector('.pagination');
  const pageSub = container.querySelector('.page-sub');

  /* --- data loading ------------------------------------------------ */

  const load = async () => {
    state.loading = true;
    state.error = null;
    renderRows();
    const filters = {};
    if (state.status !== 'all') filters.status = state.status;
    if (config.categoryField && state.category !== 'all') filters[config.categoryField] = state.category;

    const [page, ordering] = await Promise.all([
      fetchPage({
        table: config.table,
        search: state.search,
        searchFields: config.searchFields,
        filters,
        sort: state.sort,
        page: state.page,
        perPage: state.perPage,
      }),
      fetchOrdering(config.table, config.orderField, filters),
    ]);

    state.loading = false;
    if (page.error) {
      state.error = errorMessage(page.error);
      renderRows();
      return;
    }
    state.rows = page.rows;
    state.count = page.count;
    state.ordering = ordering.rows || [];
    if (pageSub) pageSub.textContent = `${state.count} ${state.count === 1 ? 'entry' : 'entries'}`;
    renderRows();
    renderPagination();
  };

  const loadCategories = async () => {
    if (!config.categoryKind) return;
    const { rows } = await listCategories(config.categoryKind);
    state.categories = rows;
    const select = container.querySelector('[data-act="category"]');
    if (select) {
      const current = select.value;
      select.innerHTML = '<option value="all">All categories</option>'
        + rows.map((c) => `<option value="${esc(c.id)}">${esc(c.name)}</option>`).join('');
      select.value = current && (current === 'all' || rows.some((c) => c.id === current)) ? current : 'all';
      state.category = select.value;
    }
  };

  /* --- rendering --------------------------------------------------- */

  const renderRows = () => {
    if (state.loading) {
      listRegion.innerHTML = loadingSkeleton(5);
      paginationEl.innerHTML = '';
      return;
    }
    if (state.error) {
      listRegion.innerHTML = errorStateHtml(state.error);
      listRegion.querySelector('[data-act="retry"]').addEventListener('click', load);
      paginationEl.innerHTML = '';
      return;
    }
    if (!state.rows.length) {
      listRegion.innerHTML = emptyState({
        title: `No ${config.label.toLowerCase()} yet`,
        message: state.search || state.status !== 'all' || state.category !== 'all'
          ? 'Nothing matches the current filters.'
          : `Create your first ${config.singular} to get started.`,
        actionLabel: state.search || state.status !== 'all' || state.category !== 'all' ? '' : `New ${config.singular}`,
      });
      const actionBtn = listRegion.querySelector('[data-act="empty-action"]');
      if (actionBtn) actionBtn.addEventListener('click', () => navigate(`#/${config.key}/new`));
      paginationEl.innerHTML = '';
      return;
    }
    if (config.listView === 'gallery') renderGalleryGrid();
    else renderTable();
  };

  const rowActionsHtml = (row) => `
    <div class="row-actions">
      <button class="icon-btn" data-action="edit" title="Edit" aria-label="Edit">${icons.edit}</button>
      <button class="icon-btn" data-action="preview" title="Preview" aria-label="Preview">${icons.eye}</button>
      <button class="icon-btn" data-action="toggle" title="${row.status === 'published' ? 'Unpublish' : 'Publish'}" aria-label="${row.status === 'published' ? 'Unpublish' : 'Publish'}">
        ${row.status === 'published' ? icons.eye : icons.check}
      </button>
      <button class="icon-btn danger" data-action="delete" title="Delete" aria-label="Delete">${icons.trash}</button>
    </div>`;

  const renderTable = () => {
    const cols = config.listColumns;
    const head = cols.map((col) => {
      const sortable = col.sortable ? 'sortable' : '';
      const active = state.sort.key === col.key;
      const arrow = active ? (state.sort.dir === 'asc' ? icons.arrowUp : icons.arrowDown) : '';
      return `<th class="${sortable} ${active ? 'sorted' : ''}" ${col.sortable ? `data-sort="${esc(col.key)}" tabindex="0" role="button"` : ''}>${esc(col.label)}<span class="sort-arrow">${arrow}</span></th>`;
    }).join('');

    const body = state.rows.map((row) => {
      const tds = cols.map((col) => {
        switch (col.type) {
          case 'title-image': {
            const img = col.imageField ? row[col.imageField] : '';
            const text = row[config.titleField] || (col.fallbackField ? row[col.fallbackField] : '') || '(untitled)';
            return `<td class="cell-title">
              <div class="title-cell">
                ${img ? `<img class="row-thumb" src="${esc(img)}" alt="" />` : `<span class="row-thumb row-thumb-empty">${icons.file}</span>`}
                <div>
                  <span class="row-title">${esc(text)}</span>
                  ${config.slugField && row[config.slugField] ? `<span class="row-slug">/${esc(row[config.slugField])}</span>` : ''}
                </div>
              </div>
            </td>`;
          }
          case 'category':
            return `<td>${esc(categoryName(state.categories, row[config.categoryField]))}</td>`;
          case 'status':
            return `<td><span class="badge badge-${esc(row.status)}">${esc(row.status)}</span></td>`;
          case 'updated':
            return `<td title="${esc(row.updated_at || '')}">${esc(timeAgo(row.updated_at))}</td>`;
          case 'number':
            return `<td class="cell-number">${esc(row[col.key] ?? 0)}</td>`;
          case 'boolean':
            return `<td>${row[col.key] ? icons.check : '<span class="text-muted">-</span>'}</td>`;
          default:
            return `<td>${esc(row[col.key] ?? '-')}</td>`;
        }
      }).join('');
      return `
        <tr draggable="true" data-id="${esc(row.id)}">
          <td class="cell-grip" title="Drag to reorder">${icons.grip}</td>
          ${tds}
          <td class="cell-actions">
            ${rowActionsHtml(row)}
            <div class="order-buttons">
              <button class="icon-btn" data-action="up" title="Move up" aria-label="Move up">${icons.arrowUp}</button>
              <button class="icon-btn" data-action="down" title="Move down" aria-label="Move down">${icons.arrowDown}</button>
            </div>
          </td>
        </tr>`;
    }).join('');

    listRegion.innerHTML = `
      <div class="table-wrap">
        <table class="data-table">
          <thead>
            <tr>
              <th class="cell-grip"></th>
              ${head}
              <th class="cell-actions">Actions</th>
            </tr>
          </thead>
          <tbody>${body}</tbody>
        </table>
      </div>`;
    wireRows(listRegion.querySelector('tbody'));
  };

  const renderGalleryGrid = () => {
    const cards = state.rows.map((row) => `
      <div class="gallery-card" draggable="true" data-id="${esc(row.id)}">
        <div class="gallery-card-img">
          ${row.image_url
            ? `<img src="${esc(row.image_url)}" alt="${esc(row.alt_text || '')}" />`
            : `<div class="gallery-card-empty">${icons.imagePlus}</div>`}
          <button class="star-btn ${row.featured ? 'active' : ''}" data-action="feature" title="${row.featured ? 'Unfeature' : 'Feature'}" aria-label="Toggle featured">${row.featured ? icons.starFilled : icons.star}</button>
          <span class="badge badge-${esc(row.status)} gallery-card-badge">${esc(row.status)}</span>
        </div>
        <div class="gallery-card-body">
          <h3 class="gallery-card-title">${esc(row.title || '(untitled)')}</h3>
          <p class="gallery-card-meta">${esc([row.location, row.capture_date ? formatDate(row.capture_date) : ''].filter(Boolean).join(' · ') || '-')}</p>
          <div class="gallery-card-footer">
            ${rowActionsHtml(row)}
            <div class="order-buttons">
              <button class="icon-btn" data-action="up" title="Move up" aria-label="Move up">${icons.arrowUp}</button>
              <button class="icon-btn" data-action="down" title="Move down" aria-label="Move down">${icons.arrowDown}</button>
            </div>
          </div>
        </div>
      </div>`);
    listRegion.innerHTML = `<div class="gallery-grid">${cards.join('')}</div>`;
    wireRows(listRegion.querySelector('.gallery-grid'));
  };

  const renderPagination = () => {
    const pages = Math.max(1, Math.ceil(state.count / state.perPage));
    if (pages <= 1) {
      paginationEl.innerHTML = '';
      return;
    }
    paginationEl.innerHTML = `
      <button class="btn btn-ghost btn-sm" data-act="prev" ${state.page <= 1 ? 'disabled' : ''} type="button">${icons.chevronLeft}<span>Prev</span></button>
      <span class="page-info">Page ${state.page} of ${pages}</span>
      <button class="btn btn-ghost btn-sm" data-act="next" ${state.page >= pages ? 'disabled' : ''} type="button"><span>Next</span>${icons.chevronRight}</button>`;
    paginationEl.querySelector('[data-act="prev"]').addEventListener('click', () => {
      if (state.page > 1) {
        state.page -= 1;
        load();
      }
    });
    paginationEl.querySelector('[data-act="next"]').addEventListener('click', () => {
      if (state.page < pages) {
        state.page += 1;
        load();
      }
    });
  };

  /* --- row interactions -------------------------------------------- */

  const persistOrder = async (idsInOrder) => {
    const changed = [];
    idsInOrder.forEach((id, index) => {
      const prev = state.ordering.find((o) => o.id === id);
      if (!prev || prev[config.orderField] !== index) changed.push({ id, value: index });
    });
    if (!changed.length) return;
    const { error } = await batchOrder(config.table, changed, config.orderField);
    if (error) {
      toast(errorMessage(error, 'Could not save the new order.'), 'error');
    } else {
      toast('Order saved.');
    }
    await load();
  };

  /** Move row with `id` before/after `targetId` inside the full ordering. */
  const moveRelative = (id, targetId, placeBefore) => {
    const ids = state.ordering.map((o) => o.id);
    const from = ids.indexOf(id);
    const target = ids.indexOf(targetId);
    if (from < 0 || target < 0) return;
    ids.splice(from, 1);
    let insertAt = ids.indexOf(targetId);
    if (!placeBefore) insertAt += 1;
    ids.splice(insertAt, 0, id);
    persistOrder(ids);
  };

  const wireRows = (scope) => {
    if (!scope) return;
    scope.querySelectorAll('[data-id]').forEach((rowEl) => {
      const id = rowEl.dataset.id;
      const row = state.rows.find((r) => r.id === id) || {};

      rowEl.querySelectorAll('[data-action]').forEach((btn) => {
        btn.addEventListener('click', async (e) => {
          e.stopPropagation();
          const action = btn.dataset.action;
          if (action === 'edit') {
            navigate(`#/${config.key}/edit/${id}`);
          } else if (action === 'preview') {
            previewModal(config, row, state.categories);
          } else if (action === 'toggle') {
            const next = row.status === 'published' ? 'draft' : 'published';
            setBusy(btn, true);
            const { error } = await updateRow(config.table, id, { status: next });
            setBusy(btn, false);
            if (error) toast(errorMessage(error), 'error');
            else {
              toast(next === 'published' ? 'Published.' : 'Moved to drafts.');
              await load();
            }
          } else if (action === 'delete') {
            const ok = await confirmDialog({
              title: `Delete ${config.singular}?`,
              message: `This will permanently delete <strong>${esc(entryName(config, row))}</strong>. This cannot be undone.`,
              confirmLabel: 'Delete',
            });
            if (!ok) return;
            const { error } = await deleteRow(config.table, id);
            if (error) toast(errorMessage(error), 'error');
            else {
              toast(`${config.singular[0].toUpperCase() + config.singular.slice(1)} deleted.`);
              await load();
            }
          } else if (action === 'feature') {
            const { error } = await updateRow(config.table, id, { featured: !row.featured });
            if (error) toast(errorMessage(error), 'error');
            else await load();
          } else if (action === 'up' || action === 'down') {
            const ids = state.rows.map((r) => r.id);
            const index = ids.indexOf(id);
            const sibling = action === 'up' ? ids[index - 1] : ids[index + 1];
            if (!sibling) return;
            moveRelative(id, sibling, action === 'up');
          }
        });
      });

      // Drag & drop reordering.
      rowEl.addEventListener('dragstart', (e) => {
        rowEl.classList.add('dragging');
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', id);
      });
      rowEl.addEventListener('dragend', () => rowEl.classList.remove('dragging'));
      rowEl.addEventListener('dragover', (e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        rowEl.classList.add('drag-over');
      });
      rowEl.addEventListener('dragleave', () => rowEl.classList.remove('drag-over'));
      rowEl.addEventListener('drop', (e) => {
        e.preventDefault();
        rowEl.classList.remove('drag-over');
        const draggedId = e.dataTransfer.getData('text/plain');
        if (!draggedId || draggedId === id) return;
        const rect = rowEl.getBoundingClientRect();
        const before = config.listView === 'gallery'
          ? e.clientY < rect.top + rect.height / 2
          : true; // table rows: insert before the hovered row
        moveRelative(draggedId, id, before);
      });
    });
  };

  /* --- toolbar wiring ---------------------------------------------- */

  const newButton = container.querySelector('[data-act="new"]');
  if (newButton) newButton.addEventListener('click', () => navigate(`#/${config.key}/new`));
  const searchInput = container.querySelector('[data-act="search"]');
  searchInput.addEventListener('input', debounce(() => {
    state.search = searchInput.value.trim();
    state.page = 1;
    load();
  }, 300));
  container.querySelector('[data-act="status"]').addEventListener('change', (e) => {
    state.status = e.target.value;
    state.page = 1;
    load();
  });
  const catSelect = container.querySelector('[data-act="category"]');
  if (catSelect) {
    catSelect.addEventListener('change', (e) => {
      state.category = e.target.value;
      state.page = 1;
      load();
    });
    container.querySelector('[data-act="manage-cats"]').addEventListener('click', () => {
      manageCategories(config.categoryKind, async () => {
        await loadCategories();
        await load();
      });
    });
  }
  listRegion.addEventListener('click', (e) => {
    const th = e.target.closest('th[data-sort]');
    if (!th) return;
    const key = th.dataset.sort;
    state.sort = {
      key,
      dir: state.sort.key === key && state.sort.dir === 'asc' ? 'desc' : 'asc',
    };
    load();
  });
  listRegion.addEventListener('keydown', (e) => {
    const th = e.target.closest('th[data-sort]');
    if (th && (e.key === 'Enter' || e.key === ' ')) {
      e.preventDefault();
      th.click();
    }
  });

  loadCategories().then(load);
}

/* ------------------------------------------------------------------ */
/* Form page engine                                                    */
/* ------------------------------------------------------------------ */

/* ------------------------------------------------------------------ */
/* Drafts                                                              */
/* ------------------------------------------------------------------ */

/**
 * The admin router re-renders the whole page on every hash change, so an
 * in-progress form (including media that was just uploaded and only lives in
 * the form state) used to vanish the moment the editor opened another tab -
 * e.g. uploading one documentation photo, glancing at the Gallery tab, and
 * coming back to an empty form.
 *
 * A session-scoped draft per (table, id) fixes that: it is written whenever the
 * editor is left with unsaved changes and replayed when the same form is opened
 * again. It disappears on save, on explicit discard, or when the session ends.
 */
const draftStorage = () => {
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
};

export const readDraft = (config, id) => readDraftFor(draftStorage(), config.table, id);
export const clearDraft = (config, id) => clearDraftFor(draftStorage(), config.table, id);
const writeDraft = (config, id, row) => writeDraftFor(draftStorage(), config.table, id, row);

/** The form currently mounted, so a route change can snapshot it first. */
let activeForm = null;

/** \"Draft restored\" strip shown above a replayed form. */
function draftBanner(savedAt, mediaCount, onDiscard) {
  const when = timeAgo(savedAt);
  const detail = mediaCount
    ? `Last edited ${when} - ${mediaCount} documentation image${mediaCount === 1 ? '' : 's'} in this draft.`
    : `Last edited ${when}.`;
  const banner = el(`
    <div class="draft-banner" role="status">
      <span class="draft-banner-icon" aria-hidden="true">${icons.alert || ''}</span>
      <div class="draft-banner-text">
        <strong>Unsaved draft restored</strong>
        <span>${esc(detail)}</span>
      </div>
      <button class="btn btn-ghost btn-sm" type="button" data-act="discard-draft">Discard draft</button>
    </div>`);
  banner.querySelector('[data-act="discard-draft"]').addEventListener('click', () => {
    if (window.confirm('Discard this draft and reload what is saved in the database?')) onDiscard();
  });
  return banner;
}

/**
 * Called by the router before it replaces #content. Snapshots an unsaved form
 * (fields + media list) into its draft slot. Safe to call at any time.
 */
export function flushActiveFormDraft() {
  const current = activeForm;
  activeForm = null;
  if (!current || !current.isDirty()) return;
  try {
    const { values, media } = current.collect();
    writeDraft(current.config, current.id, rowFromValues(values, media));
  } catch (err) {
    console.warn('[draft] could not snapshot the form', err);
  }
}

/* ------------------------------------------------------------------ */
/* Form page                                                           */
/* ------------------------------------------------------------------ */

export function renderFormPage(container, config, id, navigate, hooks = {}) {
  const isNew = !id;
  let dirty = false;
  let form = null;
  let categories = [];

  const setDirty = (value) => {
    dirty = value;
    if (typeof hooks.setGuard === 'function') {
      hooks.setGuard(dirty ? guard : null);
    }
  };
  /**
   * Tab / route navigation: never block, never lose work. The router calls
   * flushActiveFormDraft() which snapshots this form first, so the editor can
   * hop to another tab (e.g. the Gallery) and come back to the same state.
   */
  const guard = () => true;
  /** Explicit "Cancel"/"Back" - the user means to abandon, so ask first. */
  const confirmDiscard = () => {
    if (!dirty) return true;
    const ok = window.confirm('Discard the unsaved changes in this form?');
    if (ok) clearDraft(config, id);
    return ok;
  };
  // Reload / tab close: keep the work as a draft instead of nagging with the
  // browser's generic "leave site?" prompt - the draft is replayed on return.
  const beforeUnload = () => {
    flushActiveFormDraft();
  };
  window.addEventListener('beforeunload', beforeUnload);

  container.innerHTML = `
    <div class="page">
      <header class="page-header">
        <div class="page-header-left">
          <button class="icon-btn" data-act="back" type="button" aria-label="Back to list">${icons.chevronLeft}</button>
          <div>
            <h1 class="page-title">${isNew ? `New ${esc(config.singular)}` : `Edit ${esc(config.singular)}`}</h1>
            <p class="page-sub" data-role="subtitle">${isNew ? 'Fill in the details below' : ''}</p>
          </div>
        </div>
        <div class="page-header-actions">
          <button class="btn btn-ghost" data-act="preview" type="button">${icons.eye}<span>Preview</span></button>
          <button class="btn btn-ghost" data-act="cancel" type="button">Cancel</button>
          <button class="btn btn-primary" data-act="save" type="button">${icons.check}<span>Save</span></button>
        </div>
      </header>
      <div class="form-region">${loadingSkeleton(4)}</div>
    </div>`;

  const formRegion = container.querySelector('.form-region');
  const subtitle = container.querySelector('[data-role="subtitle"]');

  const leave = () => {
    activeForm = null;
    window.removeEventListener('beforeunload', beforeUnload);
    if (typeof hooks.setGuard === 'function') hooks.setGuard(null);
    navigate(`#/${config.key}`);
  };

  container.querySelector('[data-act="back"]').addEventListener('click', () => {
    if (confirmDiscard()) leave();
  });
  container.querySelector('[data-act="cancel"]').addEventListener('click', () => {
    if (confirmDiscard()) leave();
  });

  const init = async () => {
    let row = {};
    if (!isNew) {
      const { row: fetched, error } = await getRow(config.table, id);
      if (error || !fetched) {
        formRegion.innerHTML = errorStateHtml(errorMessage(error, 'Could not load this entry.'));
        formRegion.querySelector('[data-act="retry"]').addEventListener('click', init);
        return;
      }
      row = fetched;
      subtitle.textContent = entryName(config, row);

      // Hydrate the gallery. Without this the editor opened EMPTY, and saving
      // then deleted every project_media row (only the cover survived).
      const galleryField = (config.fields || []).find((f) => f.type === 'gallery' && f.name.startsWith('__'));
      if (config.mediaTable && galleryField) {
        const { rows: mediaRows, error: mediaError } = await listProjectMedia(id);
        row[galleryField.name] = mediaError ? [] : mediaRows;
      }
    }

    if (config.categoryKind) {
      const { rows } = await listCategories(config.categoryKind);
      categories = rows;
    }

    // Replay a draft left behind when the editor was closed/tab-switched with
    // unsaved work (uploaded media included). The banner lets the user throw it
    // away and go back to what is actually stored.
    const draft = readDraft(config, id);
    if (draft && draft.row) {
      row = { ...row, ...draft.row };
    }

    form = buildForm(config, row, categories, {
      onChange: () => setDirty(true),
    });
    formRegion.innerHTML = '';
    if (draft && draft.row) formRegion.appendChild(draftBanner(draft.at, describeDraft(draft.row).media, () => {
      clearDraft(config, id);
      init();
    }));
    formRegion.appendChild(form.root);
    if (draft && draft.row) setDirty(true);
    activeForm = { config, id, isDirty: () => dirty, collect: () => form.collect() };

    // Preview uses the values currently typed in the form.
    container.querySelector('[data-act="preview"]').addEventListener('click', () => {
      const { values, media } = form.collect();
      const merged = { ...values };
      if (media) merged.__media = media;
      previewModal(config, merged, categories);
    });

    container.querySelector('[data-act="save"]').addEventListener('click', async (e) => {
      const btn = e.currentTarget;
      const result = form.validate();
      if (!result.ok) {
        toast('Please fix the highlighted fields.', 'error');
        const firstError = form.root.querySelector('.has-error input, .has-error textarea, .has-error select');
        if (firstError) firstError.focus();
        return;
      }
      setBusy(btn, true, 'Saving…');
      const { values, media } = form.collect();
      const { error } = await saveRow(config, values, media, isNew ? null : id);
      setBusy(btn, false);
      if (error) {
        toast(errorMessage(error, 'Could not save.'), 'error');
        return;
      }
      setDirty(false);
      clearDraft(config, id);
      if (isNew) clearDraft(config, null);
      toast(isNew ? `${config.singular[0].toUpperCase() + config.singular.slice(1)} created.` : 'Changes saved.');
      leave();
    });
  };

  init();
}

/* ------------------------------------------------------------------ */
/* Reusable "edit in modal" helper (used by contact / settings views)  */
/* ------------------------------------------------------------------ */

export function editInModal(config, row, { categories = [], onSave, title, validateExtra } = {}) {
  const form = buildForm(config, row || {}, categories, {
    validateExtra,
  });
  const footer = el(`
    <div class="modal-footer">
      <button class="btn btn-ghost" data-act="cancel" type="button">Cancel</button>
      <button class="btn btn-primary" data-act="save" type="button">${icons.check}<span>Save</span></button>
    </div>`);
  const modal = openModal({
    title: title || (row && row.id ? `Edit ${config.singular}` : `New ${config.singular}`),
    body: form.root,
    footer,
    wide: true,
  });
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
    const { error } = await saveRow(config, values, null, row && row.id ? row.id : null);
    setBusy(btn, false);
    if (error) {
      toast(errorMessage(error, 'Could not save.'), 'error');
      return;
    }
    toast('Saved.');
    modal.close();
    if (typeof onSave === 'function') onSave();
  });
  return modal;
}
