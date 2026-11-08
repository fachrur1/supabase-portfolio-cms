/**
 * src/cms/public-content.ts - public-site CMS loader.
 *
 * Loaded by index.html as a module. Exposes window.CMS.loadContent() which
 * returns { textData, imgData, settingsData } in the exact legacy shape the
 * renderer expects (built by src/cms/shape.js).
 *
 * Data source priority:
 *   1. Supabase (when VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY are set) -
 *      published rows only (enforced by Row Level Security).
 *   2. Static fallback (api/data.json, api/images.json, api/settings.json) -
 *      handled by the caller in index.html when this module is absent or the
 *      CMS request fails. The public page therefore keeps working even before
 *      Supabase is configured.
 *
 * Performance: plain fetch() against the Supabase REST (PostgREST) endpoint -
 * supabase-js is intentionally NOT bundled into the public page.
 */

import { buildContentShape } from './shape.js';

type Row = Record<string, unknown>;

const ENV: Record<string, string> = (import.meta as { env?: Record<string, string> }).env || {};
const SUPABASE_URL: string = ENV.VITE_SUPABASE_URL || '';
const SUPABASE_ANON_KEY: string = ENV.VITE_SUPABASE_ANON_KEY || '';

export function isCmsConfigured(): boolean {
  return Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);
}

async function restGet(path: string): Promise<Row[]> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      Accept: 'application/json'
    }
  });
  if (!res.ok) {
    throw new Error(`CMS fetch failed (${res.status}) for ${path}`);
  }
  return (await res.json()) as Row[];
}

async function fetchPublishedContent(): Promise<{
  textData: Row;
  imgData: Record<string, string>;
  settingsData: { text_alignment: string };
}> {
  const q = (table: string, order?: string) =>
    restGet(`${table}?select=*${order ? `&order=${order}` : ''}`);

  const [
    profiles,
    projects,
    projectMedia,
    experiences,
    education,
    skills,
    organizations,
    gallery,
    categories,
    settingsRows,
    socialLinks,
    documents,
    siteImages
  ] = await Promise.all([
    q('profiles'),
    q('projects', 'sort_order.asc'),
    q('project_media', 'sort_order.asc'),
    q('experiences', 'sort_order.asc'),
    q('education', 'display_order.asc'),
    q('skills', 'sort_order.asc'),
    q('organizations', 'sort_order.asc'),
    q('gallery', 'sort_order.asc'),
    q('content_categories', 'sort_order.asc'),
    q('site_settings'),
    q('social_links', 'sort_order.asc'),
    restGet('documents?select=*&is_active=eq.true'),
    q('site_images')
  ]);

  const settings: Record<string, unknown> = {};
  for (const row of settingsRows) {
    settings[String(row.key)] = row.value;
  }

  const shape = buildContentShape({
    profiles: profiles as never,
    projects: projects as never,
    projectMedia: projectMedia as never,
    experiences: experiences as never,
    education: education as never,
    skills: skills as never,
    organizations: organizations as never,
    gallery: gallery as never,
    categories: categories as never,
    settings,
    socialLinks: socialLinks as never,
    documents: documents as never,
    siteImages: siteImages as never
  });

  applyCvLinks(documents);
  return shape as never;
}

/** Point every "Download CV" anchor at the currently active CV document. */
export function applyCvLinks(documents: Row[]): void {
  const active = documents.find(d => d.is_active && d.file_url);
  if (!active || typeof document === 'undefined') return;
  const href = String(active.file_url);
  if (!/^(https?:\/\/|\/)/i.test(href)) return;
  document.querySelectorAll<HTMLAnchorElement>('a[download]').forEach(a => {
    const current = a.getAttribute('href') || '';
    // Only touch CV-style anchors, not arbitrary downloads.
    if (/\.pdf($|\?)/i.test(current)) {
      a.setAttribute('href', href);
    }
  });
}

async function loadContent(): Promise<{
  textData: Row;
  imgData: Record<string, string>;
  settingsData: { text_alignment: string };
}> {
  if (!isCmsConfigured()) {
    throw new Error('CMS not configured');
  }
  return fetchPublishedContent();
}

declare global {
  interface Window {
    CMS?: {
      loadContent: typeof loadContent;
      isCmsConfigured: typeof isCmsConfigured;
    };
    CMS_READY?: Promise<void>;
  }
}

window.CMS = { loadContent, isCmsConfigured };
