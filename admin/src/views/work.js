// Unified Projects & Experiences area; the underlying tables/forms remain distinct.
import { esc, icons, el } from '../ui.js';
import { modules } from '../schemas.js';
import { renderListPage } from '../crud.js';

const TYPES = [
  { key: 'all', label: 'All' },
  { key: 'projects', label: 'Projects' },
  { key: 'experiences', label: 'Experiences' },
];

function renderList(target, type, navigate) {
  const section = el(`
    <section class="card work-list-section">
      <header class="work-list-header">
        <div>
          <h2 class="card-title">${icons[type === 'projects' ? 'projects' : 'experiences']}<span>${esc(modules[type].label)}</span></h2>
          <p class="text-muted">Manage ${esc(type === 'projects' ? 'portfolio projects' : 'professional and research experiences')}.</p>
        </div>
      </header>
      <div class="work-list-content"></div>
    </section>`);
  target.appendChild(section);
  renderListPage(section.querySelector('.work-list-content'), modules[type], navigate, { hideHeader: true });
}

export function renderWorkPage(container, navigate, activeTab = 'all') {
  if (!TYPES.some((tab) => tab.key === activeTab)) activeTab = 'all';
  container.innerHTML = `
    <div class="page work-page">
      <header class="page-header">
        <div>
          <h1 class="page-title">Projects &amp; Experiences</h1>
          <p class="page-sub">Manage portfolio projects and professional experiences in one place.</p>
        </div>
        <div class="page-header-actions">
          <button class="btn btn-primary" data-act="new-project" type="button">${icons.plus}<span>New project</span></button>
          <button class="btn btn-ghost" data-act="new-experience" type="button">${icons.plus}<span>New experience</span></button>
        </div>
      </header>
      <nav class="work-tabs" aria-label="Content type">
        ${TYPES.map((tab) => `<button class="btn btn-sm ${tab.key === activeTab ? 'btn-primary' : 'btn-ghost'}" data-tab="${esc(tab.key)}" type="button" aria-pressed="${tab.key === activeTab}">${esc(tab.label)}</button>`).join('')}
      </nav>
      <div class="work-lists"></div>
    </div>`;

  container.querySelector('[data-act="new-project"]').addEventListener('click', () => navigate('#/projects/new'));
  container.querySelector('[data-act="new-experience"]').addEventListener('click', () => navigate('#/experiences/new'));
  container.querySelectorAll('[data-tab]').forEach((button) => {
    button.addEventListener('click', () => {
      const tab = button.dataset.tab;
      navigate(tab === 'all' ? '#/work' : `#/work/${tab}`);
    });
  });

  const lists = container.querySelector('.work-lists');
  if (activeTab === 'all') {
    renderList(lists, 'projects', navigate);
    renderList(lists, 'experiences', navigate);
  } else {
    renderList(lists, activeTab, navigate);
  }
}
