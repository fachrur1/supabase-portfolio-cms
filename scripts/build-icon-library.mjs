// scripts/build-icon-library.mjs
//
// Generates admin/src/icon-library.js from the OFFICIAL Material Symbols
// metadata, so every icon name shipped to the picker is guaranteed to exist.
//
//   node scripts/build-icon-library.mjs
//
// Needs network access. Curated group names that are missing from the official
// set are dropped with a warning instead of shipping a broken glyph.

import fs from 'fs';

const META_URL = 'https://fonts.google.com/metadata/icons?incomplete=1&key=material_symbols';
const OUT = 'admin/src/icon-library.js';

/** Curated groups - names are validated against the official metadata below. */
const GROUPS = [
  ['Energy & Sustainability', [
    'bolt', 'electric_bolt', 'solar_power', 'wind_power', 'water_drop', 'waves', 'eco',
    'energy_savings_leaf', 'battery_charging_full', 'ev_station', 'electric_meter', 'power',
    'propane_tank', 'oil_barrel', 'air', 'thermostat', 'wb_sunny', 'heat_pump', 'mode_fan_off',
    'forest', 'park', 'grass', 'agriculture',
  ]],
  ['GIS & Spatial', [
    'map', 'map_search', 'layers', 'terrain', 'satellite_alt', 'travel_explore', 'public',
    'location_on', 'pin_drop', 'radar', 'explore', 'navigation', 'landscape', 'water',
    'distance', 'straighten', 'grid_on', 'polyline', 'route', 'my_location', 'share_location',
  ]],
  ['Data & Technology', [
    'memory', 'developer_board', 'settings_input_component', 'router', 'sensors', 'hub',
    'integrations', 'api', 'database', 'storage', 'analytics', 'monitoring', 'insights',
    'query_stats', 'functions', 'code', 'terminal', 'bug_report', 'build', 'construction',
    'precision_manufacturing', 'science', 'biotech', 'sensors_off', 'cable', 'lan',
  ]],
  ['Design & 3D', [
    'palette', 'brush', 'design_services', 'draw', 'shapes', 'view_in_ar', '3d_rotation',
    'category', 'photo_camera', 'movie', 'videocam', 'animation', 'texture', 'gradient',
    'format_paint', 'imagesearch_roller', 'interests', 'color_lens', 'contrast', 'crop',
  ]],
  ['Science & Research', [
    'science', 'biotech', 'experiment', 'calculate', 'functions', 'architecture', 'straighten',
    'speed', 'air', 'thermostat', 'device_thermostat', 'compress', 'water_damage',
    'fluid', 'gas_meter', 'light_mode', 'energy_program_saving',
  ]],
  ['People & Education', [
    'school', 'menu_book', 'workspace_premium', 'groups', 'person', 'diversity_3', 'handshake',
    'volunteer_activism', 'psychology', 'lightbulb', 'quiz', 'emoji_objects', 'military_tech',
    'co_present', 'badge', 'id_card',
  ]],
  ['Work & Projects', [
    'work', 'business_center', 'corporate_fare', 'apartment', 'assignment', 'description',
    'fact_check', 'task_alt', 'verified', 'timeline', 'checklist', 'flag', 'star', 'bookmark',
    'workspace_premium', 'inventory_2', 'folder', 'folder_open',
  ]],
  ['Contact & Social', [
    'mail', 'alternate_email', 'call', 'chat', 'forum', 'send', 'share', 'link', 'language',
    'qr_code', 'contact_mail', 'contact_phone', 'photo_camera', 'movie', 'public',
  ]],
  ['Interface & Actions', [
    'dashboard', 'settings', 'tune', 'filter_list', 'sort', 'search', 'add', 'edit', 'delete',
    'visibility', 'drag_indicator', 'label', 'sell', 'open_in_new', 'download', 'upload',
    'refresh', 'sync', 'menu', 'more_vert',
  ]],
  ['Status & Feedback', [
    'check_circle', 'error', 'warning', 'info', 'pending', 'schedule', 'history', 'update',
    'trending_up', 'trending_down', 'insights', 'verified', 'new_releases', 'celebration',
    'priority_high', 'help',
  ]],
];

const res = await fetch(META_URL, { headers: { accept: 'application/json' } });
if (!res.ok) throw new Error(`metadata fetch failed: ${res.status}`);
const json = JSON.parse((await res.text()).replace(/^\)\]\}'\s*/, ''));
// The metadata repeats names across categories, so de-duplicate before shipping.
const all = [...new Set((json.icons || []).map((i) => i.name))].sort();
const known = new Set(all);
if (!known.size) throw new Error('metadata contained no icons');

const missing = [];
const groups = GROUPS.map(([label, names]) => {
  const list = [];
  for (const name of names) {
    if (known.has(name)) { if (!list.includes(name)) list.push(name); }
    else missing.push(name);
  }
  return { label, icons: list };
}).filter((g) => g.icons.length);

if (missing.length) {
  console.warn(`⚠ ${missing.length} curated icon(s) not in the official set (dropped): ${missing.join(', ')}`);
}

const header = `// admin/src/icon-library.js
//
// GENERATED FILE - do not edit by hand.
// Source: Google Material Symbols metadata (${all.length} icons at generation time).
// Regenerate with:  node scripts/build-icon-library.mjs
//
// ICON_GROUPS are curated for this portfolio (energy, GIS, data, 3D, education…).
// ICON_NAMES is the complete official list so authors can search anything.

`;

const body = `export const ICON_GROUPS = ${JSON.stringify(groups, null, 2)};

/** Every official Material Symbols name, as a compact space-separated string. */
const RAW = ${JSON.stringify(all.join(' '))};

export const ICON_NAMES = RAW.split(' ');

const NAME_SET = new Set(ICON_NAMES);

/** True when the name exists in the official set. */
export function isKnownIcon(name) {
  return NAME_SET.has(String(name || '').trim());
}

/**
 * Ranked search over the official list.
 * Prefix matches first, then word-boundary matches, then substring matches.
 */
export function searchIcons(query, limit = 120) {
  const q = String(query || '').trim().toLowerCase().replace(/\\s+/g, '_');
  if (!q) return [];
  const starts = [];
  const words = [];
  const contains = [];
  for (const name of ICON_NAMES) {
    if (name.startsWith(q)) starts.push(name);
    else if (name.includes('_' + q)) words.push(name);
    else if (name.includes(q)) contains.push(name);
    if (starts.length >= limit) break;
  }
  return [...starts, ...words, ...contains].slice(0, limit);
}
`;

fs.writeFileSync(OUT, header + body);
const bytes = Buffer.byteLength(header + body);
console.log(`✔ wrote ${OUT} - ${groups.length} groups, ${groups.reduce((n, g) => n + g.icons.length, 0)} curated, ${all.length} searchable names (${(bytes / 1024).toFixed(1)} kB)`);
