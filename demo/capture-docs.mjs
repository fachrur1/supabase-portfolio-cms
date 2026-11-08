#!/usr/bin/env node
// ============================================================================
// demo/capture-docs.mjs - capture the documentation screenshots from the demo.
//
// Prerequisites (all local, no credentials):
//   1. a production build of the site, configured to talk to the mock:
//        VITE_SUPABASE_URL=http://localhost:8787 \
//        VITE_SUPABASE_ANON_KEY=demo-anon-key npx vite build --outDir <demo-site>
//   2. node demo/export-fallback.mjs --site <demo-site>   (fictional fallbacks)
//   3. node demo/serve.mjs --site <demo-site> --port 8787
//
// Then, from a checkout that has puppeteer installed:
//   node demo/capture-docs.mjs --out <repo>/docs/images [--base http://localhost:8787]
//   node demo/capture-docs.mjs --only 05,19        # re-shoot individual frames
//
// Every pixel here comes from demo/demo-dataset.mjs. The script asserts that
// the rendered hero carries demo-only copy and refuses to write anything if it
// looks like a live-site build.
// ============================================================================

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer';

function arg(name, fallback = null) {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

const BASE = arg('base', 'http://localhost:8787');
const OUT = path.resolve(arg('out', 'docs/images'));
const DEMO_EMAIL = arg('email', 'admin@example.com');
const DEMO_PASSWORD = arg('password', 'demo-password');
const ONLY = (arg('only', '') || '').split(',').map((s) => s.trim()).filter(Boolean);
const PROJECT_ID = arg('project-id', '00000000-0000-4000-8000-000000000200');

fs.mkdirSync(OUT, { recursive: true });

const want = (key) => ONLY.length === 0 || ONLY.some((k) => key.startsWith(k));

const shot = async (page, key, name, opts = {}) => {
  if (!want(key)) return;
  const file = path.join(OUT, name);
  await page.screenshot({ path: file, ...opts });
  const { size } = fs.statSync(file);
  console.log(`[capture] ${name} ${(size / 1024).toFixed(0)} KB`);
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Read the local redaction list. The owner's identity strings are NOT stored in
 * this repository: `demo/redactions.local.json` is gitignored and only needed
 * when capturing from a build that still carries the production page chrome
 * (footer name, contact defaults, CV filename).
 *
 *   { "redactions": [["Name Surname", "Demo Person"], ["old@mail.dev", "hi@example.com"]] }
 */
function loadRedactions() {
  const explicit = arg('redactions', null);
  const here = (() => {
    try {
      return path.dirname(fileURLToPath(import.meta.url));
    } catch {
      return process.cwd();
    }
  })();
  const candidates = [explicit, path.join(here, 'redactions.local.json'), path.join(process.cwd(), 'demo', 'redactions.local.json')]
    .filter(Boolean)
    .map((p) => path.resolve(p));

  const file = candidates.find((p) => fs.existsSync(p));
  if (!file) {
    console.log('[capture] no redactions.local.json found: assuming an all-demo build');
    return [];
  }
  console.log(`[capture] redactions: ${file}`);
  const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
  return (parsed.redactions || []).map(([from, to]) => [new RegExp(escapeRx(from), 'gi'), to, from]);
}

const escapeRx = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Hide the custom-cursor overlays and apply the local redaction list so no
 *  capture can leak personal data. Fails loudly if a pattern survives. */
async function neutralizeBrand(page, redactions) {
  await page.evaluate((rules) => {
    const style = document.createElement('style');
    style.textContent =
      '#cursor-dot,#cursor-outline,#cursor-ring,.cursor-ring,.cursor-glow,#scroll-progress{display:none!important}';
    document.head.appendChild(style);

    const map = rules.map(([pattern, replacement]) => [new RegExp(pattern, 'gi'), replacement]);

    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    const nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);
    for (const node of nodes) {
      let value = node.nodeValue;
      for (const [rx, to] of map) value = value.replace(rx, to);
      if (value !== node.nodeValue) node.nodeValue = value;
    }

    for (const el of document.querySelectorAll('[href],[src],[alt],[title],[content]')) {
      for (const attr of ['href', 'src', 'alt', 'title', 'content']) {
        const current = el.getAttribute(attr);
        if (!current) continue;
        let value = current;
        for (const [rx, to] of map) value = value.replace(rx, to);
        if (value !== current) el.setAttribute(attr, value);
      }
    }

    // Brand mark: whatever letter the page ships -> the demo persona's initial.
    for (const el of document.querySelectorAll('.w-10.h-10.bg-primary, .w-8.h-8.bg-primary')) {
      if (el.textContent.trim().length <= 2) el.textContent = 'M';
    }
  }, redactions.map(([rx, to]) => [rx.source, to]));

  if (!redactions.length) return;

  const leak = await page.evaluate((sources) => {
    const haystack = [
      document.body.innerText,
      ...[...document.querySelectorAll('[href],[src],[alt],[title],[content]')].flatMap((el) =>
        ['href', 'src', 'alt', 'title', 'content'].map((a) => el.getAttribute(a) || '')
      )
    ].join('\n').toLowerCase();
    return sources.filter((src) => haystack.includes(src.toLowerCase()));
  }, redactions.map(([, , src]) => src));

  if (leak.length) {
    throw new Error(`refusing to capture: redaction failed for ${leak.join(', ')}`);
  }
}

/** Scroll a section into view, nudge the sticky header out of the way, settle. */
async function reveal(page, selector, extra = 0) {
  await page.evaluate((sel, off) => {
    const el = document.querySelector(sel);
    if (!el) throw new Error(`missing ${sel}`);
    const y = el.getBoundingClientRect().top + window.scrollY - 72 + off;
    window.scrollTo({ top: y, behavior: 'instant' });
  }, selector, extra);
  await sleep(1400);
}

async function openPublic(page, redactions) {
  await page.goto(`${BASE}/?capture=1`, { waitUntil: 'networkidle2', timeout: 60000 });
  await page.waitForFunction(
    () => document.getElementById('cms-hero-title')?.textContent?.trim(),
    { timeout: 30000 }
  );
  await neutralizeBrand(page, redactions);
  await sleep(2600); // hero typewriter + entrance animations

  const heroText = await page.$eval('#cms-hero-title', (el) => el.textContent);
  if (!/Engineering/i.test(heroText)) {
    throw new Error(
      `refusing to capture: hero does not look like the demo dataset (got "${heroText}")`
    );
  }
}

/** A gallery that failed to load collapses to zero height, which would make the
 *  next screenshot silently capture the section above it. Assert it has prints. */
async function assertGallery(page, selector) {
  const state = await page.evaluate((sel) => {
    const section = document.querySelector(sel);
    return {
      state: section?.getAttribute('data-mf-state') || '',
      prints: section?.querySelectorAll('.mf-print, .mf-view, figure').length || 0,
      height: Math.round(section?.getBoundingClientRect().height || 0)
    };
  }, selector);
  if (state.state === 'empty' || state.height < 200) {
    throw new Error(`${selector} did not load: ${JSON.stringify(state)}`);
  }
  console.log(`[capture] ${selector} ok: ${JSON.stringify(state)}`);
}

async function capturePublic(browser, redactions) {
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });
  page.on('pageerror', (e) => console.warn('[page error]', e.message));
  await openPublic(page, redactions);

  await shot(page, '01', '01-hero.png');
  await reveal(page, '#about', -10);
  await shot(page, '02', '02-about-education.png');
  await reveal(page, '#skills');
  await shot(page, '03', '03-skills.png');
  await reveal(page, '#projects');
  await shot(page, '04', '04-works-carousel.png');

  // Open the first work card -> rich description modal
  if (want('05')) {
    const opened = await page.evaluate(() => {
      const btn = document.querySelector('#cms-works-container button');
      if (!btn) return false;
      btn.click();
      return true;
    });
    if (opened) {
      await sleep(1500);
      await shot(page, '05', '05-work-modal.png');
      // Scroll the modal body so the metadata grid, themed cards and markdown
      // table are all visible in one frame.
      await page.evaluate(() => {
        const modal = document.querySelector('.modal-content');
        if (modal) modal.scrollTop = 460;
      });
      await sleep(900);
      await shot(page, '05b', '05b-work-modal-body.png');
      await page.evaluate(() => {
        const modal = document.querySelector('.modal-content');
        if (modal) modal.scrollTop = 980;
      });
      await sleep(900);
      await shot(page, '05c', '05c-work-modal-learnings.png');
      // Close by clicking the modal's own close button; Escape is not bound.
      await page.evaluate(() => {
        const close = document.querySelector('.modal-overlay button[onclick*="closeModal"]');
        if (close) close.click();
      });
      await page.waitForFunction(
        () => !document.querySelector('.modal-overlay:not(.hidden)'),
        { timeout: 10000 }
      );
      await sleep(800);
    }
  }

  await reveal(page, '#photography');
  await shot(page, '06', '06-photography.png');
  await reveal(page, '#motion');
  await sleep(2400);
  await assertGallery(page, '#motion');
  await shot(page, '07', '07-motion-gallery.png');
  await reveal(page, '#render-3d');
  await sleep(2400);
  await assertGallery(page, '#render-3d');
  await shot(page, '08', '08-render3d-gallery.png');
  await reveal(page, '#organizations');
  await shot(page, '09', '09-organizations-contact.png');
  await reveal(page, '#contact', -20);
  await shot(page, '09b', '09b-contact.png');

  const mobile = await browser.newPage();
  await mobile.setViewport({ width: 390, height: 844, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
  await mobile.goto(`${BASE}/?capture=1`, { waitUntil: 'networkidle2', timeout: 60000 });
  await mobile.waitForFunction(
    () => document.getElementById('cms-hero-title')?.textContent?.trim(),
    { timeout: 30000 }
  );
  await neutralizeBrand(mobile, redactions);
  await sleep(2600);
  await shot(mobile, '10', '10-mobile-hero.png');
  await reveal(mobile, '#projects');
  await shot(mobile, '11', '11-mobile-works.png');
  await mobile.close();
  await page.close();
}

async function captureAdmin(browser, redactions) {
  const admin = await browser.newPage();
  await admin.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });
  admin.on('pageerror', (e) => console.warn('[admin error]', e.message));

  await admin.goto(`${BASE}/admin/`, { waitUntil: 'networkidle2', timeout: 60000 });
  await sleep(1200);
  await shot(admin, '12', '12-admin-login.png');

  await admin.type('#login-email', DEMO_EMAIL);
  await admin.type('#login-password', DEMO_PASSWORD);
  await admin.click('button[type="submit"]');
  await admin.waitForFunction(() => document.querySelector('.app-shell'), { timeout: 30000 });
  await sleep(2200);
  await shot(admin, '13', '13-admin-dashboard.png');

  const routes = [
    ['#/work', '14', '14-admin-works.png'],
    ['#/gallery', '15', '15-admin-gallery.png'],
    ['#/motion', '16', '16-admin-motion.png'],
    ['#/render3d', '17', '17-admin-render3d.png'],
    ['#/settings', '18', '18-admin-settings.png']
  ];
  for (const [hash, key, name] of routes) {
    if (!want(key)) continue;
    await admin.goto(`${BASE}/admin/${hash}`, { waitUntil: 'networkidle2' });
    await sleep(1900);
    await shot(admin, key, name);
  }

  /* Project editor form (deep link straight to the demo project) */
  if (want('19') || want('20') || want('21')) {
    await admin.goto(`${BASE}/admin/#/projects/edit/${PROJECT_ID}`, { waitUntil: 'networkidle2' });
    try {
      await admin.waitForFunction(
        () => !!document.querySelector('form input[name="title"], .form input[name="title"], input[name="title"]'),
        { timeout: 15000 }
      );
    } catch {
      console.warn('[capture] project editor did not render - check the route key');
    }
    await sleep(2000);
    await shot(admin, '19', '19-admin-project-form.png');

    await admin.evaluate(() => {
      const field = [...document.querySelectorAll('.field, .form-section, section, .gallery-control')]
        .find((el) => /gallery/i.test(el.textContent || ''));
      if (field) field.scrollIntoView({ block: 'center', behavior: 'instant' });
      else window.scrollTo(0, 1200);
    });
    await sleep(1000);
    await shot(admin, '20', '20-admin-project-form-media.png');
  }

  /* Category manager + Material Symbols icon picker */
  if (want('21') || want('22')) {
    await admin.goto(`${BASE}/admin/#/projects`, { waitUntil: 'networkidle2' });
    await sleep(1800);
    const opened = await admin.evaluate(() => {
      const btn = document.querySelector('[data-act="manage-cats"]');
      if (!btn) return false;
      btn.click();
      return true;
    });
    if (!opened) {
      console.warn('[capture] category manager button not found');
    } else {
      await sleep(1600);
      await shot(admin, '21', '21-admin-categories.png');
      const picked = await admin.evaluate(() => {
        const btn = document.querySelector('.cat-row [data-act="pick-icon"]');
        if (!btn) return false;
        btn.click();
        return true;
      });
      if (picked) {
        await sleep(1400);
        await shot(admin, '22', '22-admin-icon-picker.png');
      } else {
        console.warn('[capture] icon picker button not found');
      }
    }
  }

  await admin.close();
}

async function main() {
  const redactions = loadRedactions();
  console.log(`[capture] ${redactions.length} redaction rule(s) loaded`);
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--font-render-hinting=none', '--force-color-profile=srgb']
  });
  try {
    await capturePublic(browser, redactions);
    await captureAdmin(browser, redactions);
  } finally {
    await browser.close();
  }
  console.log(`[capture] done -> ${OUT}`);
}

main().catch((err) => {
  console.error('[capture] failed:', err);
  process.exit(1);
});