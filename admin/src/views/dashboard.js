// admin/src/views/dashboard.js - overview with stats, recent updates, quick actions.
import { esc, icons, timeAgo, errorMessage, errorStateHtml, loadingSkeleton } from '../ui.js';
import { fetchStats, fetchRecentUpdates } from '../api.js';

const QUICK_ACTIONS = [
  { label: 'New project', route: '#/projects/new', icon: 'projects' },
  { label: 'New experience', route: '#/experiences/new', icon: 'experiences' },
  { label: 'New education entry', route: '#/education/new', icon: 'education' },
  { label: 'Upload photo', route: '#/gallery/new', icon: 'gallery' },
];

const TABLE_BADGES = {
  projects: 'Project',
  experiences: 'Experience',
  education: 'Education',
  skills: 'Skill',
  organizations: 'Organization',
  gallery: 'Photo',
};

export function renderDashboard(container, navigate) {
  container.innerHTML = `
    <div class="page">
      <header class="page-header">
        <div>
          <h1 class="page-title">Dashboard</h1>
          <p class="page-sub">Portfolio content at a glance</p>
        </div>
      </header>
      <div class="stats-region">${loadingSkeleton(3)}</div>
      <div class="dashboard-columns">
        <section class="card">
          <h2 class="card-title">${icons.clock}<span>Recent updates</span></h2>
          <div class="recent-region">${loadingSkeleton(4)}</div>
        </section>
        <section class="card">
          <h2 class="card-title">${icons.plus}<span>Quick actions</span></h2>
          <div class="quick-actions"></div>
        </section>
      </div>
    </div>`;

  const statsRegion = container.querySelector('.stats-region');
  const recentRegion = container.querySelector('.recent-region');
  const quickRegion = container.querySelector('.quick-actions');

  quickRegion.innerHTML = QUICK_ACTIONS.map((action) => `
    <button class="btn btn-ghost quick-btn" data-route="${esc(action.route)}" type="button">
      ${icons[action.icon]}<span>${esc(action.label)}</span>
    </button>`).join('');
  quickRegion.querySelectorAll('[data-route]').forEach((btn) => {
    btn.addEventListener('click', () => navigate(btn.dataset.route));
  });

  const load = async () => {
    statsRegion.innerHTML = loadingSkeleton(1);
    recentRegion.innerHTML = loadingSkeleton(4);

    const [{ stats, error }, recent] = await Promise.all([fetchStats(), fetchRecentUpdates(8)]);

    if (error) {
      statsRegion.innerHTML = errorStateHtml(errorMessage(error, 'Could not load statistics.'));
      statsRegion.querySelector('[data-act="retry"]').addEventListener('click', load);
    } else {
      const cards = [
        { label: 'Total projects', value: stats.projects, route: '#/work/projects', icon: 'projects' },
        { label: 'Total experiences', value: stats.experiences, route: '#/work/experiences', icon: 'experiences' },
        { label: 'Total organizations', value: stats.organizations, route: '#/organizations', icon: 'organizations' },
        { label: 'Total education entries', value: stats.education, route: '#/education', icon: 'education' },
        { label: 'Total published', value: stats.published, route: '#/work', icon: 'check', accent: true },
        { label: 'Total drafts', value: stats.drafts, route: '#/work', icon: 'edit' }
      ];
      statsRegion.innerHTML = `<div class="stat-grid">${cards.map((card) => `
        <button class="stat-card ${card.accent ? 'stat-accent' : ''}" data-route="${esc(card.route)}" type="button">
          <span class="stat-icon">${icons[card.icon]}</span>
          <span class="stat-value">${esc(card.value)}</span>
          <span class="stat-label">${esc(card.label)}</span>
        </button>`).join('')}</div>`;
      statsRegion.querySelectorAll('[data-route]').forEach((btn) => {
        btn.addEventListener('click', () => navigate(btn.dataset.route));
      });
    }

    if (!recent.length) {
      recentRegion.innerHTML = '<p class="text-muted">No content yet. Use the quick actions to get started.</p>';
    } else {
      recentRegion.innerHTML = `<ul class="recent-list">${recent.map((item) => `
        <li>
          <button class="recent-item" data-route="${esc(item.route)}" type="button">
            <span class="badge badge-table">${esc(TABLE_BADGES[item.table] || item.table)}</span>
            <span class="recent-title">${esc(item.title)}</span>
            <span class="recent-meta">
              <span class="badge badge-${esc(item.status || 'draft')}">${esc(item.status || 'draft')}</span>
              <span class="text-muted">${esc(timeAgo(item.updated_at))}</span>
            </span>
          </button>
        </li>`).join('')}</ul>`;
      recentRegion.querySelectorAll('[data-route]').forEach((btn) => {
        btn.addEventListener('click', () => navigate(btn.dataset.route));
      });
    }
  };

  load();
}
