// admin/src/views/documents.js - CV & document management (documents table + storage).
import {
  el, esc, icons, toast, openModal, confirmDialog, errorMessage, errorStateHtml,
  loadingSkeleton, setBusy, timeAgo, formatBytes, formatDate,
} from '../ui.js';
import { supabase, fetchPage, updateRow, deleteRow, setActiveDocument } from '../api.js';
import { uploadPdf, DOCUMENTS_BUCKET } from '../uploads.js';
import { schemas } from '../schemas.js';
import { buildForm } from '../crud.js';

const config = schemas.documents;

const DOC_TYPE_LABELS = { cv: 'CV', portfolio: 'Portfolio', certificate: 'Certificate', other: 'Other' };

export function renderDocuments(container) {
  container.innerHTML = `
    <div class="page">
      <header class="page-header">
        <div>
          <h1 class="page-title">CV / Documents</h1>
          <p class="page-sub">PDF documents and the active CV used by the public “Download CV” button</p>
        </div>
        <button class="btn btn-primary" data-act="upload" type="button">${icons.upload}<span>Upload PDF</span></button>
      </header>
      <div class="list-region">${loadingSkeleton(3)}</div>
      <div class="upload-progress hidden">${icons.spinner}<span>Uploading PDF…</span></div>
    </div>`;

  const listRegion = container.querySelector('.list-region');
  const progress = container.querySelector('.upload-progress');
  const uploadInput = el('<input type="file" accept="application/pdf" style="display:none" />');
  container.appendChild(uploadInput);

  const load = async () => {
    listRegion.innerHTML = loadingSkeleton(3);
    const { rows, error } = await fetchPage({
      table: 'documents',
      sort: { key: 'uploaded_at', dir: 'desc' },
      page: 1,
      perPage: 50,
    });
    if (error) {
      listRegion.innerHTML = errorStateHtml(errorMessage(error, 'Could not load documents.'));
      listRegion.querySelector('[data-act="retry"]').addEventListener('click', load);
      return;
    }
    if (!rows.length) {
      listRegion.innerHTML = `
        <div class="empty-state">
          <div class="empty-icon">${icons.documents}</div>
          <h3>No documents yet</h3>
          <p>Upload a PDF - typically your CV - to make it available on the public site.</p>
        </div>`;
      return;
    }

    listRegion.innerHTML = `
      <div class="table-wrap">
        <table class="data-table">
          <thead>
            <tr>
              <th>Title</th><th>Type</th><th>Version</th><th>Size</th><th>Uploaded</th><th>Status</th>
              <th class="cell-actions">Actions</th>
            </tr>
          </thead>
          <tbody>
            ${rows.map((row) => `
              <tr data-id="${esc(row.id)}">
                <td class="cell-title">
                  <div class="title-cell">
                    <span class="row-thumb row-thumb-empty">${icons.file}</span>
                    <div>
                      <span class="row-title">${esc(row.title)}</span>
                      ${row.description ? `<span class="row-slug">${esc(row.description.slice(0, 60))}${row.description.length > 60 ? '…' : ''}</span>` : ''}
                    </div>
                  </div>
                </td>
                <td><span class="badge badge-table">${esc(DOC_TYPE_LABELS[row.doc_type] || row.doc_type)}</span></td>
                <td>${esc(row.version || '-')}</td>
                <td>${esc(formatBytes(row.file_size))}</td>
                <td title="${esc(row.uploaded_at || '')}">${esc(timeAgo(row.uploaded_at))}</td>
                <td>${row.is_active
                  ? `<span class="badge badge-published">Active</span>`
                  : `<span class="badge badge-draft">Inactive</span>`}</td>
                <td class="cell-actions">
                  <div class="row-actions">
                    ${row.is_active ? '' : `<button class="btn btn-ghost btn-sm" data-action="activate" title="Set as active CV" type="button">${icons.check}<span>Set active</span></button>`}
                    <button class="icon-btn" data-action="preview" title="Preview" aria-label="Preview">${icons.eye}</button>
                    <button class="icon-btn" data-action="edit" title="Edit" aria-label="Edit">${icons.edit}</button>
                    <button class="icon-btn danger" data-action="delete" title="Delete" aria-label="Delete">${icons.trash}</button>
                  </div>
                </td>
              </tr>`).join('')}
          </tbody>
        </table>
      </div>`;

    listRegion.querySelectorAll('tr[data-id]').forEach((tr) => {
      const id = tr.dataset.id;
      const row = rows.find((r) => r.id === id);
      tr.querySelectorAll('[data-action]').forEach((btn) => {
        btn.addEventListener('click', async () => {
          const action = btn.dataset.action;
          if (action === 'activate') {
            setBusy(btn, true, 'Activating…');
            const { error: actErr } = await setActiveDocument(id, row.doc_type || 'cv');
            setBusy(btn, false);
            if (actErr) toast(errorMessage(actErr), 'error');
            else {
              toast(row.doc_type === 'cv' ? 'Active CV updated.' : 'Active document updated.');
              load();
            }
          } else if (action === 'preview') {
            previewDocument(row);
          } else if (action === 'edit') {
            openDocumentModal(row, null, load);
          } else if (action === 'delete') {
            await handleDelete(row, load);
          }
        });
      });
    });
  };

  /* --- upload ------------------------------------------------------ */

  uploadInput.addEventListener('change', async () => {
    const file = uploadInput.files && uploadInput.files[0];
    uploadInput.value = '';
    if (!file) return;
    progress.classList.remove('hidden');
    try {
      const meta = await uploadPdf(file);
      progress.classList.add('hidden');
      const title = file.name.replace(/\.pdf$/i, '').replace(/[_-]+/g, ' ').trim();
      openDocumentModal(null, {
        title,
        file_url: meta.url,
        storage_path: meta.path,
        mime_type: meta.mimeType,
        file_size: meta.size,
      }, load);
    } catch (err) {
      progress.classList.add('hidden');
      toast(err.message || 'Upload failed.', 'error');
    }
  });

  container.querySelector('[data-act="upload"]').addEventListener('click', () => uploadInput.click());

  load();
}

/* ------------------------------------------------------------------ */

function previewDocument(row) {
  const body = el(`
    <div class="doc-preview">
      <iframe src="${esc(row.file_url)}" title="${esc(row.title)}" type="application/pdf"></iframe>
      <p class="text-muted small">
        <a href="${esc(row.file_url)}" target="_blank" rel="noopener">${icons.external}<span>Open in a new tab</span></a>
      </p>
    </div>`);
  openModal({ title: row.title, body, wide: true });
}

async function handleDelete(row, reload) {
  const isCv = (row.doc_type || 'cv') === 'cv';

  if (row.is_active && isCv) {
    const { rows: others, error } = await fetchPage({
      table: 'documents',
      filters: { doc_type: 'cv' },
      sort: { key: 'uploaded_at', dir: 'desc' },
      page: 1,
      perPage: 50,
    });
    if (error) {
      toast(errorMessage(error), 'error');
      return;
    }
    const remaining = others.filter((r) => r.id !== row.id && r.doc_type === 'cv');
    if (!remaining.length) {
      toast('This is the only CV - upload and activate another CV before deleting it.', 'error');
      return;
    }
    const promoted = remaining[0];
    const ok = await confirmDialog({
      title: 'Delete active CV?',
      message: `<strong>${esc(row.title)}</strong> is the active CV. Deleting it will promote <strong>${esc(promoted.title)}</strong> as the active CV. Continue?`,
      confirmLabel: 'Delete & promote',
    });
    if (!ok) return;
    const { error: delError } = await deleteRow('documents', row.id);
    if (delError) {
      toast(errorMessage(delError), 'error');
      return;
    }
    await setActiveDocument(promoted.id, 'cv');
    toast('CV deleted and the next CV promoted.');
    reload();
    return;
  }

  const ok = await confirmDialog({
    title: 'Delete document?',
    message: `This will permanently delete <strong>${esc(row.title)}</strong> and its file. This cannot be undone.`,
    confirmLabel: 'Delete',
  });
  if (!ok) return;
  const { error: delError } = await deleteRow('documents', row.id);
  if (delError) {
    toast(errorMessage(delError), 'error');
    return;
  }
  if (row.storage_path) {
    // Best-effort cleanup of the stored file - the row is the source of truth.
    try {
      await supabase.storage.from(DOCUMENTS_BUCKET).remove([row.storage_path]);
    } catch {
      /* ignore */
    }
  }
  toast('Document deleted.');
  reload();
}

/** Modal form for creating (after upload) or editing a document row. */
function openDocumentModal(existing, fileMeta, reload) {
  const isNew = !existing;
  const row = existing || {
    title: fileMeta.title,
    description: '',
    doc_type: 'cv',
    version: '',
  };
  const form = buildForm(config, row, [], {});
  const info = el(`
    <div class="notice">
      ${isNew
        ? `<strong>Uploaded:</strong> ${esc(fileMeta.title)} - ${esc(formatBytes(fileMeta.file_size))} · ${esc(formatDate(new Date().toISOString()))}`
        : `<strong>File:</strong> <a href="${esc(existing.file_url)}" target="_blank" rel="noopener">${icons.external}<span>Open PDF</span></a> · ${esc(formatBytes(existing.file_size))} · uploaded ${esc(timeAgo(existing.uploaded_at))}`}
    </div>`);
  const body = el('<div></div>');
  body.appendChild(info);
  body.appendChild(form.root);

  const footer = el(`
    <div class="modal-footer">
      <button class="btn btn-ghost" data-act="cancel" type="button">Cancel</button>
      <button class="btn btn-primary" data-act="save" type="button">${icons.check}<span>${isNew ? 'Create document' : 'Save'}</span></button>
    </div>`);
  const modal = openModal({ title: isNew ? 'New document' : 'Edit document', body, footer, wide: true });
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
    let response;
    if (isNew) {
      response = await supabase.from('documents').insert({
        title: values.title,
        description: values.description || '',
        doc_type: values.doc_type || 'other',
        version: values.version || '',
        file_url: fileMeta.file_url,
        storage_path: fileMeta.storage_path,
        mime_type: fileMeta.mime_type,
        file_size: fileMeta.file_size,
        is_active: false,
      }).select().single();
    } else {
      response = await supabase.from('documents').update({
        title: values.title,
        description: values.description || '',
        doc_type: values.doc_type || 'other',
        version: values.version || '',
      }).eq('id', existing.id).select().single();
    }
    setBusy(btn, false);
    if (response.error) {
      toast(errorMessage(response.error, 'Could not save the document.'), 'error');
      return;
    }
    toast(isNew ? 'Document created.' : 'Document updated.');
    modal.close();
    reload();
  });
}
