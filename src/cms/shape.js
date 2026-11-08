/**
 * src/cms/shape.js - Shared content-shape mapper.
 *
 * Converts CMS database rows (Supabase tables) into the EXACT legacy shape the
 * existing index.html renderer consumes:
 *
 *   textData  = { hero, about, contact, education[], skills[], organizations[],
 *                 photography[], works[], settings }
 *   imgData   = { [imageKey]: url }
 *   settingsData = { text_alignment }
 *
 * This file is plain ESM (no bundler-specific syntax) so it can be imported by:
 *   - src/cms/public-content.ts (bundled by Vite for the public site)
 *   - scripts/migrate-to-supabase.mjs (Node - migration + fidelity checks)
 *   - tests/shape.test.mjs (node --test)
 *
 * FIDELITY RULES (do not break):
 *   1. Descriptions pass through verbatim. The public renderer re-parses
 *      "Role:"/"Organization:"/... meta lines and "Problem:"/"Action:" block
 *      headers out of the description string, so anything already present in
 *      `full_description` must NOT be duplicated by the composer below.
 *   2. Structured fields are merged in ONLY when the description does not
 *      already contain the matching meta line / block header.
 *   3. Draft rows are never emitted (defense in depth on top of RLS).
 */

/** Meta-line keys understood by the public work-modal renderer. */
export const LEGACY_META_KEYS = [
  'Role', 'Organization', 'Duration', 'Focus', 'Tools', 'Location', 'Award', 'Organizer'
];

/** Block headers rendered as styled cards by the public work-modal renderer. */
export const LEGACY_BLOCK_HEADERS = [
  'Problem', 'Approach / Process', 'Action', 'Outcome', 'Key Learnings'
];

// ---------------------------------------------------------------------------
// Small utilities
// ---------------------------------------------------------------------------

/** Coerce jsonb text[] / null / undefined into a real string array. */
export function arr(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value.map(labelOf).filter(Boolean);
  if (typeof value === 'string') return value.split(',').map(s => s.trim()).filter(Boolean);
  return [];
}

/**
 * Older admin builds wrote tag fields as [{url, caption, alt}] objects (the
 * gallery mapping), which rendered as "[object Object]" everywhere. Recover the
 * label when one is present, and never stringify an object again.
 */
export function labelOf(value) {
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (!value || typeof value !== 'object') return '';
  for (const key of ['value', 'label', 'name', 'title', 'text', 'tag']) {
    if (typeof value[key] === 'string' && value[key].trim()) return value[key].trim();
  }
  return '';
}

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** '2026-01-01' | '2026' | null -> '2026' | '' */
export function yearOf(value) {
  if (!value) return '';
  const m = String(value).match(/(\d{4})/);
  return m ? m[1] : '';
}

/**
 * Duration meta text matching the legacy style, e.g. '2024', '2026 - Present',
 * '2019 - 2022'. Returns '' when there is no usable start date.
 */
export function durationText(start, end, current) {
  const y1 = yearOf(start);
  if (!y1) return '';
  if (current || !end) return `${y1} - Present`;
  const y2 = yearOf(end);
  if (!y2) return `${y1} - Present`;
  return y1 === y2 ? y1 : `${y1} - ${y2}`;
}

/** True when the markdown text already has a "Key:" meta line at line start. */
export function hasMetaLine(text, key) {
  if (!text) return false;
  return new RegExp(`^\\**\\s*${escapeRegex(key)}\\s*:`, 'm').test(text);
}

/** True when the text already has a standalone "Header:" block line. */
export function hasBlockHeader(text, header) {
  if (!text) return false;
  return new RegExp(`^\\**\\s*${escapeRegex(header)}\\s*:\\**\\s*$`, 'm').test(text);
}

/**
 * Extract existing meta lines from a legacy description.
 * Used by the migration to fill structured columns without touching the text.
 * @returns {Object<string,string>} e.g. { Role: 'Research Staff', ... }
 */
export function extractMetaLines(text) {
  const out = {};
  if (!text) return out;
  for (const raw of String(text).split(/\r\n|\r|\n/)) {
    const m = raw.match(/^\**\s*([A-Za-z /]+?)\s*:\**\s*(.*)$/);
    if (m && LEGACY_META_KEYS.includes(m[1])) {
      out[m[1]] = m[2].replace(/\r$/, '').trim();
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Description composers
// ---------------------------------------------------------------------------

/** True when the text already has any legacy meta line at line start. */
export function hasAnyMetaLine(text) {
  return LEGACY_META_KEYS.some(k => hasMetaLine(text, k));
}

function composeDescription(body, metaPairs, blockPairs) {
  const pre = [];
  // A description that already uses the meta-line format is self-describing
  // (legacy entries): render it verbatim and never merge extra meta lines.
  // Plain narrative/empty descriptions get the structured fields merged in.
  const bodyIsSelfDescribing = hasAnyMetaLine(body);
  if (!bodyIsSelfDescribing) {
    for (const [key, value] of metaPairs) {
      if (value && !hasMetaLine(body, key)) pre.push(`${key}: ${value}`);
    }
  }
  let out = pre.length ? pre.join('\n\n') + '\n\n' : '';
  out += body || '';
  for (const [header, content] of blockPairs) {
    if (content && !hasBlockHeader(out, header)) {
      out += (out.trim() ? '\n\n' : '') + `${header}:\n\n${content}`;
    }
  }
  return out;
}

/**
 * True when the description OPENS with a meta line, i.e. the author has taken
 * control of the metadata block themselves.
 */
export function startsWithMetaLine(text) {
  if (!text) return false;
  for (const raw of String(text).split(/\r\n|\r|\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const m = line.match(/^\**\s*([A-Za-z /]+?)\s*:\**\s*(.*)$/);
    return Boolean(m && LEGACY_META_KEYS.includes(m[1].trim()));
  }
  return false;
}

/**
 * Guarantee a metadata block built from the structured CMS columns.
 *
 *   • description opens with `Role:`/`Duration:`/…  -> author owns it, untouched
 *   • description is narrative or only carries stray meta lines mid-text
 *     -> every structured key that is still missing gets added on top
 *
 * Keys already present anywhere in the text are never duplicated, so an author
 * who writes "Duration: 1 Month (Full-time)" mid-paragraph keeps that wording.
 * The public renderer turns these lines into the metadata grid; without this
 * fallback a narrative-only description left the grid empty.
 *
 * @param {string} text composed description
 * @param {Array<[string,string]>} metaPairs canonical [key, value] pairs
 * @returns {string}
 */
export function ensureMetaBlock(text, metaPairs) {
  const body = text || '';
  if (startsWithMetaLine(body)) return body;
  const existing = extractMetaLines(body);
  const missing = (metaPairs || []).filter(
    ([key, value]) => value && existing[key] === undefined
  );
  if (!missing.length) return body;
  const block = missing.map(([key, value]) => `${key}: ${value}`).join('\n\n');
  return body.trim() ? `${block}\n\n${body}` : block;
}

/**
 * Compose the legacy work-modal description for a project row.
 * Meta: Role / Organization / Duration / Location / Focus / Tools.
 * Blocks: Approach / Process (methodology), Outcome (project_outcomes),
 *         Key Learnings (key_achievements). technical_specifications is
 *         appended as raw markdown before the blocks.
 */
export function buildProjectDescription(p) {
  const metaPairs = [
    ['Role', (p.role || '').trim()],
    ['Organization', (p.team || '').trim()],
    ['Duration', durationText(p.start_date, p.completion_date, false)],
    ['Location', (p.location || '').trim()],
    ['Focus', arr(p.technical_skills).join(', ')],
    ['Tools', (arr(p.tools).length ? arr(p.tools) : arr(p.technologies)).join(', ')]
  ];
  let body = p.full_description || '';
  const specs = (p.technical_specifications || '').trim();
  if (specs && !hasBlockHeader(body, 'Technical Specifications')) {
    body += (body.trim() ? '\n\n' : '') + specs;
  }
  const blockPairs = [
    ['Approach / Process', (p.methodology || '').trim()],
    ['Outcome', (p.project_outcomes || '').trim()],
    ['Key Learnings', (p.key_achievements || '').trim()]
  ];
  return ensureMetaBlock(composeDescription(body, metaPairs, blockPairs), metaPairs);
}

/**
 * Compose the legacy work-modal description for an experience row.
 * Meta: Role (position) / Organization / Duration / Location.
 * Blocks: Action (responsibilities), Outcome (achievements).
 */
export function buildExperienceDescription(e) {
  const metaPairs = [
    ['Role', (e.position || '').trim()],
    ['Organization', (e.organization_name || '').trim()],
    ['Duration', durationText(e.start_date, e.end_date, e.currently_working)],
    ['Location', (e.location || '').trim()]
  ];
  const body = e.description || '';
  const blockPairs = [
    ['Action', (e.responsibilities || '').trim()],
    ['Outcome', (e.achievements || '').trim()]
  ];
  return ensureMetaBlock(composeDescription(body, metaPairs, blockPairs), metaPairs);
}

/** Public display title for an experience row. */
export function experienceTitle(e) {
  const override = (e.title || '').trim();
  if (override) return override;
  const org = (e.organization_name || '').trim();
  const pos = (e.position || '').trim();
  if (org && pos) return `${org} - ${pos}`;
  return org || pos || 'Untitled';
}

/** Legacy education card period text, e.g. '2022 - Present', '2019 - 2022'. */
export function educationPeriod(e) {
  const y1 = yearOf(e.start_date);
  if (!y1) return '';
  const y2 = e.graduation_date ? yearOf(e.graduation_date) : 'Present';
  return `${y1} - ${y2 || 'Present'}`;
}

// ---------------------------------------------------------------------------
// Full shape builder
// ---------------------------------------------------------------------------

function bySort(a, b) {
  return (a.sort_order ?? a.display_order ?? 0) - (b.sort_order ?? b.display_order ?? 0);
}

function isPublished(row) {
  return !row || row.status !== 'draft';
}

/**
 * Build the legacy content shape from raw CMS rows.
 *
 * @param {Object} input rows keyed by table name (arrays), plus `settings` as a
 *   plain {key: value} object. All rows may include a `status` column; draft
 *   rows are filtered out here (RLS already hides them from anon clients).
 * @returns {{textData: Object, imgData: Object, settingsData: Object}}
 */
export function buildContentShape(input) {
  const src = input || {};
  const settings = src.settings || {};

  const categories = (src.categories || []).slice();
  const catById = new Map(categories.map(c => [c.id, c]));

  const profiles = (src.profiles || []).filter(isPublished);
  const primaryProfile =
    profiles.find(p => p.is_primary) || profiles[0] || {};

  const projects = (src.projects || []).filter(isPublished).slice();
  const experiences = (src.experiences || []).filter(isPublished).slice();
  const education = (src.education || []).filter(isPublished).slice().sort(bySort);
  const skills = (src.skills || []).filter(isPublished).slice();
  const organizations = (src.organizations || []).filter(isPublished).slice().sort(bySort);
  const gallery = (src.gallery || []).filter(isPublished).slice().sort(bySort);
  const siteImages = (src.siteImages || []).slice();

  // -- image map: named slots first, then synthesized per-row keys ----------
  const imgData = {};
  for (const s of siteImages) {
    if (s && s.key) imgData[s.key] = s.url || '';
  }
  imgData['profile_image'] = primaryProfile.profile_photo_url || imgData['profile_image'] || '';

  // -- project galleries grouped per project -------------------------------
  const mediaByProject = new Map();
  for (const m of src.projectMedia || []) {
    if (!m || !m.project_id) continue;
    if (!mediaByProject.has(m.project_id)) mediaByProject.set(m.project_id, []);
    mediaByProject.get(m.project_id).push(m);
  }
  for (const list of mediaByProject.values()) list.sort(bySort);

  // -- works carousel: projects + experiences marked include_in_works ------
  const workItems = [];

  projects.forEach((p, i) => {
    if (p.include_in_works === false) return;
    const cover = p.cover_url || p.thumbnail_url || '';
    const imageKey = cover ? `wm${i}` : '';
    if (cover) imgData[imageKey] = cover;

    const galleryIds = (mediaByProject.get(p.id) || [])
      .filter(m => m.url)
      .map((m, j) => {
        const key = `wg${i}_${j}`;
        imgData[key] = m.url;
        return key;
      });

    workItems.push({
      sort_order: p.sort_order ?? 0,
      display_priority: p.display_priority ?? 0,
      created_at: p.created_at || '',
      item: {
        category: (catById.get(p.category_id) || {}).name || 'Project',
        title: p.title || '',
        short_desc: p.short_description || '',
        description: buildProjectDescription(p),
        tags: arr(p.technologies).length ? arr(p.technologies) : arr(p.tools),
        image_id: imageKey,
        gallery_ids: galleryIds
      }
    });
  });

  experiences.forEach((e, i) => {
    if (e.include_in_works !== true) return;
    const media = Array.isArray(e.media) ? e.media.filter(m => m && m.url) : [];
    const main = e.logo_url || (media[0] && media[0].url) || '';
    const imageKey = main ? `em${i}` : '';
    if (main) imgData[imageKey] = main;

    const galleryIds = media.slice(main && e.logo_url ? 0 : (media[0] ? 1 : 0))
      .map((m, j) => {
        const key = `eg${i}_${j}`;
        imgData[key] = m.url;
        return key;
      });

    workItems.push({
      sort_order: e.sort_order ?? 0,
      display_priority: e.display_priority ?? 0,
      created_at: e.created_at || '',
      item: {
        category: (e.employment_type || '').trim() || 'Experience',
        title: experienceTitle(e),
        short_desc: e.short_description || '',
        description: buildExperienceDescription(e),
        tags: arr(e.skills),
        image_id: imageKey,
        gallery_ids: galleryIds
      }
    });
  });

  workItems.sort((a, b) =>
    (a.sort_order - b.sort_order) ||
    (b.display_priority - a.display_priority) ||
    String(a.created_at).localeCompare(String(b.created_at))
  );
  const works = workItems.map(w => w.item);

  // -- skills grouped by category -----------------------------------------
  const groupCats = categories
    .filter(c => c.kind === 'skill_group')
    .sort(bySort);
  const skillsByCat = new Map();
  const ungrouped = [];
  for (const s of skills.slice().sort(bySort)) {
    if (s.category_id && skillsByCat.has(s.category_id) === false) {
      skillsByCat.set(s.category_id, []);
    }
    if (s.category_id) skillsByCat.get(s.category_id).push(s);
    else ungrouped.push(s);
  }
  const skillGroups = [];
  for (const cat of groupCats) {
    const items = skillsByCat.get(cat.id) || [];
    if (!items.length) continue;
    skillGroups.push({
      category: cat.name,
      icon: cat.icon || 'category',
      items: items.map(s => s.name)
    });
  }
  if (ungrouped.length) {
    skillGroups.push({
      category: 'Other',
      icon: 'category',
      items: ungrouped.map(s => s.name)
    });
  }

  // -- photography ---------------------------------------------------------
  const photography = gallery.map((g, i) => {
    const key = `gal${i}`;
    imgData[key] = g.image_url || '';
    return { title: g.title || '', image_id: key };
  });

  // -- education / organizations ------------------------------------------
  const educationOut = education.map(e => ({
    period: educationPeriod(e),
    institution: e.institution || '',
    major: e.field_of_study || e.degree || ''
  }));

  const organizationsOut = organizations.map(o => ({
    name: o.organization_name || '',
    role: o.position || ''
  }));

  // -- hero / about / contact ---------------------------------------------
  const hero = {
    title_line1: primaryProfile.hero_line1 || '',
    title_line2: primaryProfile.hero_line2 || '',
    subtitle: primaryProfile.professional_headline || '',
    description: primaryProfile.short_intro || ''
  };
  const about = {
    heading: primaryProfile.about_heading || '',
    body: primaryProfile.about_body || ''
  };

  const links = (src.socialLinks || []).filter(l => l && l.visible !== false);
  const linkByPlatform = (platform) => {
    const hit = links.find(l => (l.platform || '').toLowerCase() === platform);
    return hit ? hit.url : '';
  };
  const emailSetting = String(
    settings.contact_email ??
    (linkByPlatform('email').replace(/^mailto:/i, '')) ??
    ''
  );
  const contact = {
    heading: String(settings.contact_heading ?? ''),
    body: String(settings.contact_body ?? ''),
    email: emailSetting,
    linkedin: linkByPlatform('linkedin'),
    instagram: linkByPlatform('instagram')
  };

  const textData = {
    hero,
    about,
    contact,
    education: educationOut,
    skills: skillGroups,
    organizations: organizationsOut,
    photography,
    works,
    photography_heading: String(settings.photography_heading ?? 'Photography'),
    photography_description: String(settings.photography_description ?? 'The Symbiosis of Engineering and Aesthetics: A visual storyteller bridging technical rigor with artistic vision, capturing the structural beauty of the human and industrial landscape.')
    // NOTE: no generic `settings` object - the renderer's site-wide alignment
    // continues through settingsData as it did before.
  };

  return {
    textData,
    imgData,
    settingsData: { text_alignment: String(settings.text_alignment ?? 'text-justify') }
  };
}

/** Pass-through for the legacy static files (fallback mode). */
export function shapeFromLegacy(textData, imgData, settingsData) {
  return {
    textData: textData || {},
    imgData: imgData || {},
    settingsData: settingsData || { text_alignment: 'text-justify' }
  };
}
