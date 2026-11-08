// admin/src/api.js - Supabase client, auth, and generic data access.
import { createClient } from '@supabase/supabase-js';
import { planMediaSync } from './media-sync.js';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const envConfigured = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);

/** Singleton Supabase client (null when env vars are missing). */
export const supabase = envConfigured ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY) : null;

/* ------------------------------------------------------------------ */
/* Auth                                                                */
/* ------------------------------------------------------------------ */

export async function getSession() {
  if (!supabase) return null;
  const { data, error } = await supabase.auth.getSession();
  if (error) return null;
  return data.session ?? null;
}

export async function signIn(email, password) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    const raw = error.message || '';
    let msg;
    if (/invalid login credentials/i.test(raw)) msg = 'Invalid email or password.';
    else if (/failed to fetch|networkerror|network|fetch failed/i.test(raw)) {
      msg = 'Could not reach the authentication service - check your internet connection and try again.';
    } else msg = raw || 'Sign in failed.';
    return { user: null, error: msg };
  }
  return { user: data.user, error: null };
}

export async function signOut() {
  if (!supabase) return;
  try {
    await supabase.auth.signOut();
  } catch {
    /* ignore - local session will be reset by the router anyway */
  }
}

export function onAuthChange(callback) {
  if (!supabase) return () => {};
  const { data } = supabase.auth.onAuthStateChange((_event, session) => callback(session));
  return () => data.subscription.unsubscribe();
}

/**
 * Verify the signed-in user has an admin_users row. Returns { ok, role, reason }.
 * reason: 'no-session' | 'no-rows' | 'error'
 */
export async function checkAdmin(userId) {
  if (!supabase || !userId) return { ok: false, role: null, reason: 'no-session' };
  const { data, error } = await supabase
    .from('admin_users')
    .select('role')
    .eq('user_id', userId)
    .maybeSingle();
  if (error) return { ok: false, role: null, reason: 'error', error };
  if (!data) return { ok: false, role: null, reason: 'no-rows' };
  return { ok: true, role: data.role, reason: null };
}

/* ------------------------------------------------------------------ */
/* Generic content CRUD                                                */
/* ------------------------------------------------------------------ */

const ilikeSafe = (term) => String(term).replace(/[%_,()]/g, ' ').trim();

/**
 * Fetch one page of rows with search / filters / sorting.
 * Returns { rows, count, error }.
 */
export async function fetchPage({
  table,
  columns = '*',
  search = '',
  searchFields = [],
  filters = {},
  sort = { key: 'created_at', dir: 'desc' },
  page = 1,
  perPage = 10,
}) {
  const from = (page - 1) * perPage;
  let query = supabase.from(table).select(columns, { count: 'exact' });

  const term = ilikeSafe(search);
  if (term && searchFields.length) {
    const or = searchFields.map((f) => `${f}.ilike.%${term}%`).join(',');
    query = query.or(or);
  }
  for (const [key, value] of Object.entries(filters || {})) {
    if (value !== undefined && value !== null && value !== '' && value !== 'all') {
      query = query.eq(key, value);
    }
  }
  query = query.order(sort.key, { ascending: sort.dir !== 'desc', nullsFirst: false }).range(from, from + perPage - 1);

  const { data, error, count } = await query;
  return { rows: data || [], count: count ?? 0, error };
}

export async function getRow(table, id) {
  const { data, error } = await supabase.from(table).select('*').eq('id', id).maybeSingle();
  return { row: data, error };
}

const MISSING_COLUMN = /does not exist|Could not find the '([a-z0-9_]+)' column|column "([a-z0-9_]+)"/i;

/**
 * PostgREST 400s the whole write when the payload names a column the table does
 * not have yet (e.g. `rotation` before its migration has been applied). Rather
 * than blocking the editor, drop that one column and retry so saving keeps
 * working until the migration runs.
 */
function missingColumnFrom(error, payload) {
  if (!error) return null;
  const msg = `${error.message || ''} ${error.details || ''} ${error.hint || ''}`;
  if (!MISSING_COLUMN.test(msg)) return null;
  const named = msg.match(/Could not find the '([a-z0-9_]+)' column/i) || msg.match(/column "?([a-z0-9_]+)"?/i);
  const column = named ? named[1] : null;
  if (column && Object.prototype.hasOwnProperty.call(payload, column)) return column;
  return null;
}

async function writeWithFallback(run, payload) {
  const first = await run(payload);
  const column = first.error ? missingColumnFrom(first.error, payload) : null;
  if (!column) return first;
  console.warn(`[api] column "${column}" is not in the database yet - saving without it. Apply the pending migration.`);
  const next = { ...payload };
  delete next[column];
  return run(next);
}

export async function createRow(table, payload) {
  return writeWithFallback(
    (p) => supabase.from(table).insert(p).select().single().then(({ data, error }) => ({ row: data, error })),
    payload
  );
}

export async function updateRow(table, id, payload) {
  return writeWithFallback(
    (p) => supabase.from(table).update(p).eq('id', id).select().single().then(({ data, error }) => ({ row: data, error })),
    payload
  );
}

export async function deleteRow(table, id) {
  const { error } = await supabase.from(table).delete().eq('id', id);
  return { error };
}

export async function upsertRow(table, payload, onConflict) {
  const { data, error } = await supabase
    .from(table)
    .upsert(payload, onConflict ? { onConflict } : undefined)
    .select()
    .single();
  return { row: data, error };
}

/** Batch-update ordering values: items = [{ id, value }]. */
export async function batchOrder(table, items, orderField) {
  const results = await Promise.all(
    items.map((item) => supabase.from(table).update({ [orderField]: item.value }).eq('id', item.id))
  );
  const failed = results.find((r) => r.error);
  return { error: failed ? failed.error : null };
}

/** Fetch the complete ordering of a table under the given filters. */
export async function fetchOrdering(table, orderField, filters = {}) {
  let query = supabase.from(table).select(`id, ${orderField}`);
  for (const [key, value] of Object.entries(filters || {})) {
    if (value !== undefined && value !== null && value !== '' && value !== 'all') {
      query = query.eq(key, value);
    }
  }
  query = query.order(orderField, { ascending: true, nullsFirst: false });
  const { data, error } = await query;
  return { rows: data || [], error };
}

/* ------------------------------------------------------------------ */
/* Categories                                                          */
/* ------------------------------------------------------------------ */

export async function listCategories(kind) {
  const { data, error } = await supabase
    .from('content_categories')
    .select('*')
    .eq('kind', kind)
    .order('sort_order', { ascending: true });
  return { rows: data || [], error };
}

export async function saveCategory(category) {
  const payload = {
    kind: category.kind,
    name: category.name,
    slug: category.slug,
    icon: category.icon || null,
    sort_order: category.sort_order ?? 0,
  };
  if (category.id) {
    return updateRow('content_categories', category.id, payload);
  }
  return createRow('content_categories', payload);
}

export async function deleteCategory(id) {
  return deleteRow('content_categories', id);
}

/* ------------------------------------------------------------------ */
/* Settings / site images                                              */
/* ------------------------------------------------------------------ */

export async function fetchSettings() {
  const { data, error } = await supabase.from('site_settings').select('*').order('key');
  const map = {};
  for (const row of data || []) map[row.key] = row;
  return { settings: map, error };
}

export async function saveSetting(key, value, label = '') {
  const { data, error } = await supabase
    .from('site_settings')
    .upsert({ key, value, label }, { onConflict: 'key' })
    .select()
    .single();
  return { row: data, error };
}

export async function fetchSiteImages() {
  const { data, error } = await supabase.from('site_images').select('*').order('key');
  return { rows: data || [], error };
}

/* ------------------------------------------------------------------ */
/* Project media (gallery rows tied to a project)                      */
/* ------------------------------------------------------------------ */

export async function fetchProjectMedia(projectId) {
  const { data, error } = await supabase
    .from('project_media')
    .select('*')
    .eq('project_id', projectId)
    .order('sort_order', { ascending: true });
  return { rows: data || [], error };
}

/** Read-side alias: `listProjectMedia` returns (rows,error) with existing rows. */
export async function listProjectMedia(projectId) {
  return fetchProjectMedia(projectId);
}

/**
 * Sync a project's gallery.
 *
 * Inserts/updates FIRST and deletes LAST: a failed insert can no longer leave
 * the project with zero images (the old delete-all-then-insert could).
 * Pass an ARRAY to replace the set; pass null/undefined to leave rows alone.
 */
export async function syncProjectMedia(projectId, items) {
  if (!Array.isArray(items)) return { error: null };
  const { rows: existing, error: readError } = await listProjectMedia(projectId);
  if (readError) return { error: readError };

  const plan = planMediaSync(existing, items);

  if (plan.toInsert.length) {
    const { error } = await supabase
      .from('project_media')
      .insert(plan.toInsert.map((row) => ({ ...row, project_id: projectId })));
    if (error) return { error };
  }

  for (const row of plan.toUpdate) {
    const { error } = await supabase
      .from('project_media')
      .update({ url: row.url, caption: row.caption, alt: row.alt, sort_order: row.sort_order })
      .eq('id', row.id);
    if (error) return { error };
  }

  if (plan.toDelete.length) {
    const { error } = await supabase.from('project_media').delete().in('id', plan.toDelete);
    if (error) return { error };
  }

  return { error: null };
}

/* ------------------------------------------------------------------ */
/* Documents (CV)                                                      */
/* ------------------------------------------------------------------ */

export async function setActiveDocument(id, docType = 'cv') {
  // Deactivate others first to avoid colliding with the single-active index.
  const off = await supabase
    .from('documents')
    .update({ is_active: false })
    .eq('doc_type', docType)
    .eq('is_active', true);
  if (off.error) return { error: off.error };
  const on = await supabase.from('documents').update({ is_active: true }).eq('id', id);
  return { error: on.error };
}

/* ------------------------------------------------------------------ */
/* Dashboard aggregates                                                */
/* ------------------------------------------------------------------ */

const CONTENT_TABLES = ['projects', 'experiences', 'education', 'skills', 'organizations', 'gallery'];

export async function fetchStats() {
  const countRows = (table, filter) => {
    let q = supabase.from(table).select('id', { count: 'exact', head: true });
    if (filter) q = q.eq('status', filter);
    return q;
  };
  const [projects, experiences, organizations, education, published, drafts] = await Promise.all([
    countRows('projects'),
    countRows('experiences'),
    countRows('organizations'),
    countRows('education'),
    Promise.all(CONTENT_TABLES.map((t) => countRows(t, 'published'))),
    Promise.all(CONTENT_TABLES.map((t) => countRows(t, 'draft'))),
  ]);

  const sumCounts = (results) => results.reduce((acc, r) => acc + (r.count ?? (r.error ? 0 : 0)), 0);

  return {
    stats: {
      projects: projects.count ?? 0,
      experiences: experiences.count ?? 0,
      organizations: organizations.count ?? 0,
      education: education.count ?? 0,
      published: sumCounts(published),
      drafts: sumCounts(drafts),
    },
    error: projects.error || experiences.error || organizations.error || education.error || null,
  };
}

const RECENT_LABELS = {
  projects: { table: 'projects', titleField: 'title', route: '#/work/projects' },
  experiences: { table: 'experiences', titleField: 'title', fallbackField: 'organization_name', route: '#/work/experiences' },
  education: { table: 'education', titleField: 'institution', route: '#/education' },
  skills: { table: 'skills', titleField: 'name', route: '#/skills' },
  organizations: { table: 'organizations', titleField: 'organization_name', route: '#/organizations' },
  gallery: { table: 'gallery', titleField: 'title', route: '#/gallery' },
};

export async function fetchRecentUpdates(limit = 8) {
  const perTable = await Promise.all(
    Object.entries(RECENT_LABELS).map(async ([table, meta]) => {
      const { data, error } = await supabase
        .from(table)
        .select(`id, ${meta.titleField}, ${meta.fallbackField ? `${meta.fallbackField}, ` : ''}status, updated_at`)
        .order('updated_at', { ascending: false })
        .limit(limit);
      if (error) return [];
      return (data || []).map((row) => ({
        id: row.id,
        table,
        route: meta.route,
        title: row[meta.titleField] || (meta.fallbackField ? row[meta.fallbackField] : '') || '(untitled)',
        status: row.status,
        updated_at: row.updated_at,
      }));
    })
  );
  return perTable
    .flat()
    .sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at))
    .slice(0, limit);
}
