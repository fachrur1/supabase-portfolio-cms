// admin/src/drafts.js - pure, storage-injected draft helpers.
//
// Why this exists: the admin router re-renders #content on every hash change,
// so an in-progress form (including documentation media that was just uploaded
// and only lives in the form state) used to vanish as soon as the editor opened
// another tab. A draft per (table, id) survives those round-trips.
//
// Kept free of DOM/Supabase imports so it can be unit-tested in Node.

export const DRAFT_PREFIX = 'cms:draft:';
export const DRAFT_TTL_MS = 12 * 60 * 60 * 1000;

/** Stable key for one editor: the same project always maps to the same slot. */
export function draftKey(table, id) {
  return `${DRAFT_PREFIX}${table}:${id || 'new'}`;
}

/** @returns {{row: object, at: number} | null} */
export function readDraft(storage, table, id, now = Date.now()) {
  if (!storage) return null;
  let raw = null;
  try {
    raw = storage.getItem(draftKey(table, id));
  } catch {
    return null;
  }
  if (!raw) return null;
  let parsed = null;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== 'object' || !parsed.row || typeof parsed.row !== 'object') return null;
  if (!parsed.at || now - parsed.at > DRAFT_TTL_MS) {
    clearDraft(storage, table, id);
    return null;
  }
  return parsed;
}

export function writeDraft(storage, table, id, row, now = Date.now()) {
  if (!storage) return false;
  try {
    storage.setItem(draftKey(table, id), JSON.stringify({ row, at: now }));
    return true;
  } catch {
    // Quota exceeded / storage disabled: drafts simply do nothing.
    return false;
  }
}

export function clearDraft(storage, table, id) {
  if (!storage) return;
  try {
    storage.removeItem(draftKey(table, id));
  } catch {
    /* ignore */
  }
}

/**
 * Turn `form.collect()` output into a row-shaped draft. Gallery media for
 * projects lives outside `values` (it is a child table), so it is folded back
 * into the pseudo-field the form builder expects.
 */
export function rowFromValues(values = {}, media = null) {
  const row = { ...values };
  if (Array.isArray(media)) row.__project_media = media;
  return row;
}

/** Count what a draft carries, for the "restored" banner. */
export function describeDraft(row = {}) {
  const media = Array.isArray(row.__project_media)
    ? row.__project_media
    : Array.isArray(row.__media)
      ? row.__media
      : [];
  const fields = Object.keys(row).filter((k) => !k.startsWith('__')).length;
  return { fields, media: media.length };
}
