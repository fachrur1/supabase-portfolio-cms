/** Convert collected form values into a database-safe payload. */
export function buildPayload(config, values) {
  const payload = {};
  for (const field of config.fields) {
    if (field.name.startsWith('__')) continue;
    let value = values[field.name];
    // Numeric selects (e.g. media rotation) must reach PostgreSQL as numbers,
    // not as the string a <select> produces.
    if (field.numeric) {
      payload[field.name] = value === '' || value === null || value === undefined || Number.isNaN(Number(value))
        ? (field.nullable ? null : 0)
        : Number(value);
      continue;
    }
    switch (field.type) {
      case 'checkbox':
        payload[field.name] = Boolean(value);
        break;
      case 'number':
        payload[field.name] = value === null || value === undefined || Number.isNaN(value)
          ? (field.nullable ? null : 0)
          : Number(value);
        break;
      case 'tags':
        // Tag editors emit plain strings. They used to fall through to the
        // gallery branch below, which turned ["Blender"] into
        // [{url:'',caption:'',alt:''}] - the site then rendered "[object Object]".
        payload[field.name] = toTagList(value);
        break;
      case 'links':
      case 'gallery':
        // Gallery values are persisted as is for jsonb columns (`media`), but
        // project_media ids belong to the relational sync, not the row payload.
        payload[field.name] = Array.isArray(value)
          ? value.map((item) => ({
              url: item?.url || '',
              caption: item?.caption || '',
              alt: item?.alt || '',
            }))
          : [];
        break;
      default:
        if ((value === '' || value === null || value === undefined) && isNullable(field)) {
          payload[field.name] = null;
        } else {
          payload[field.name] = value ?? '';
        }
    }
  }
  return payload;
}

function isNullable(field) {
  return field.nullable === true
    || ['url', 'image', 'video', 'date'].includes(field.type)
    // Category selectors store UUID foreign keys; PostgreSQL expects NULL,
    // never the empty string, when no category is selected.
    || Boolean(field.optionsFromCategories);
}

/**
 * Normalise any tag-shaped value to a flat string array.
 * Accepts strings, comma-separated strings, and (for data already damaged by
 * the old gallery-style mapping) objects carrying a label-ish property.
 */
export function toTagList(value) {
  if (typeof value === 'string') {
    return value.split(',').map((s) => s.trim()).filter(Boolean);
  }
  if (!Array.isArray(value)) return [];
  const out = [];
  for (const item of value) {
    const tag = tagText(item);
    if (tag && !out.includes(tag)) out.push(tag);
  }
  return out;
}

function tagText(item) {
  if (typeof item === 'string') return item.trim();
  if (typeof item === 'number' || typeof item === 'boolean') return String(item);
  if (!item || typeof item !== 'object') return '';
  for (const key of ['value', 'label', 'name', 'title', 'text', 'tag']) {
    if (typeof item[key] === 'string' && item[key].trim()) return item[key].trim();
  }
  return '';
}
