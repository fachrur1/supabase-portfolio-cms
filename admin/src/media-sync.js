// admin/src/media-sync.js - pure planner for the project_media table.
//
// The admin used to DELETE every media row and re-insert whatever the form
// held. That silently wiped a project's documentation images whenever the
// editor opened an entry whose gallery had never been loaded into the form.
// Planning the diff first keeps existing rows (and their ids/created_at) and
// makes the destructive step the smallest possible.
//
// Dependency-free so it can be unit-tested in plain Node.

/**
 * @typedef {{ id?: string|null, url?: string, caption?: string, alt?: string }} MediaItem
 */

/**
 * @param {Array<{id:string,url:string,caption?:string,alt?:string,sort_order?:number}>} existing rows currently in the DB
 * @param {MediaItem[]} next items as collected from the gallery editor
 * @returns {{toInsert: Array<object>, toUpdate: Array<object>, toDelete: string[], kept: number}}
 */
export function planMediaSync(existing, next) {
  const rows = Array.isArray(existing) ? existing.filter((r) => r && r.id) : [];
  const items = (Array.isArray(next) ? next : []).map(normalizeItem).filter((item) => item.url);

  const byId = new Map(rows.map((row) => [row.id, row]));
  const byUrl = new Map();
  for (const row of rows) {
    const key = normalizeUrl(row.url);
    if (key && !byUrl.has(key)) byUrl.set(key, row);
  }

  const keep = new Set();
  const toInsert = [];
  const toUpdate = [];

  items.forEach((item, index) => {
    const payload = {
      url: item.url,
      caption: item.caption,
      alt: item.alt,
      sort_order: index,
    };

    // 1. explicit id (rows round-tripped through the editor)
    let target = item.id && byId.get(item.id) ? byId.get(item.id) : null;
    // 2. same URL (row already stored, editor lost/copied the id)
    if (!target && !keep.has((byUrl.get(normalizeUrl(item.url)) || {}).id)) {
      const match = byUrl.get(normalizeUrl(item.url));
      if (match && !keep.has(match.id)) target = match;
    }

    if (target) {
      keep.add(target.id);
      const changed =
        target.url !== payload.url ||
        (target.caption || '') !== payload.caption ||
        (target.alt || '') !== payload.alt ||
        Number(target.sort_order ?? 0) !== payload.sort_order;
      if (changed) toUpdate.push({ id: target.id, ...payload });
      return;
    }

    toInsert.push(payload);
  });

  const toDelete = rows
    .filter((row) => !keep.has(row.id))
    // A row is only deleted when the editor genuinely no longer lists it AND
    // its url did not survive as a new item (guards against id loss).
    .filter((row) => !items.some((item) => normalizeUrl(item.url) === normalizeUrl(row.url)))
    .map((row) => row.id);

  return { toInsert, toUpdate, toDelete, kept: keep.size };
}

function normalizeItem(item) {
  return {
    id: item && item.id ? String(item.id) : null,
    url: String((item && item.url) || '').trim(),
    caption: String((item && item.caption) || '').trim(),
    alt: String((item && item.alt) || '').trim(),
  };
}

function normalizeUrl(url) {
  return String(url || '').trim();
}
