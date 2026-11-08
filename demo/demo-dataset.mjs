// ============================================================================
// demo/demo-dataset.mjs - fictional demo content for the CMS.
//
// Every value here is invented. Nothing is copied from the production site:
// the demo exists so the documentation screenshots can show a fully populated
// dashboard and public page without exposing a real person's data.
//
// Shape: an object keyed by table name, each value an array of rows that match
// supabase/migrations/0001_schema.sql (+ 0006/0008 for the galleries).
// ============================================================================

// Deterministic ids so screenshots and cross-table references stay stable.
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

const IMG = (name) => `/demo-img/${name}.svg`;

const CATEGORIES = [
  { key: 'cat-energy', kind: 'project', name: 'Energy Systems', slug: 'energy-systems', icon: 'bolt' },
  { key: 'cat-spatial', kind: 'project', name: 'Spatial Analysis', slug: 'spatial-analysis', icon: 'map' },
  { key: 'cat-design', kind: 'project', name: 'Design & Visualisation', slug: 'design-visualisation', icon: 'palette' },
  { key: 'cat-sim', kind: 'skill_group', name: 'Simulation', slug: 'simulation', icon: 'analytics' },
  { key: 'cat-code', kind: 'skill_group', name: 'Programming', slug: 'programming', icon: 'code' },
  { key: 'cat-gis', kind: 'skill_group', name: 'Geospatial', slug: 'geospatial', icon: 'public' },
  { key: 'cat-3d', kind: 'skill_group', name: '3D & Motion', slug: '3d-motion', icon: 'deployed_code' },
  { key: 'cat-photo', kind: 'gallery', name: 'Structure', slug: 'structure', icon: 'photo_camera' },
  { key: 'cat-texture', kind: 'gallery', name: 'Texture', slug: 'texture', icon: 'texture' },
  { key: 'cat-light', kind: 'gallery', name: 'Light', slug: 'light', icon: 'light_mode' }
];

function categories() {
  return CATEGORIES.map((c, i) => ({
    id: id(100 + i),
    kind: c.kind,
    name: c.name,
    slug: c.slug,
    icon: c.icon,
    sort_order: i,
    created_at: '2025-01-04T08:00:00Z',
    updated_at: '2025-01-04T08:00:00Z'
  }));
}

const catId = (key) => id(100 + CATEGORIES.findIndex((c) => c.key === key));

/* -------------------------------------------------------------------------- */
/* Profiles                                                                   */
/* -------------------------------------------------------------------------- */

function profiles() {
  return [
    {
      id: id(1),
      full_name: 'Morgan Ellery',
      hero_line1: 'Engineering',
      hero_line2: 'Physics.',
      professional_headline: 'Energy systems · spatial analysis · visual design',
      short_intro:
        'Applied physics graduate modelling small-scale hydropower, mapping land suitability, and rendering the results so people outside the lab can read them.',
      about_heading: 'Numbers first, then pictures.',
      about_body: [
        'I work at the intersection of **measurement** and **communication**: hydrological modelling, geospatial screening, and the visual language that makes both legible.',
        '',
        '## What I actually do',
        '',
        '- Model energy yield from measured discharge instead of assumed figures.',
        '- Screen candidate sites with terrain, land-cover and constraint layers.',
        '- Turn the output into dashboards, drawings and renders a stakeholder can act on.',
        '',
        '> Every number on this site is either observed, calculated, or explicitly labelled as an assumption.'
      ].join('\n'),
      profile_photo_url: IMG('portrait'),
      profile_photo_alt: 'Abstract placeholder standing in for the profile portrait',
      professional_interests: ['Renewable energy', 'Hydrology', 'Remote sensing', 'Computational design'],
      areas_of_expertise: ['Energy yield modelling', 'GIS', 'FEA', 'Motion design'],
      location: 'Indonesia',
      availability_status: 'Open to research collaborations',
      is_primary: true,
      status: 'published',
      created_at: '2025-01-04T08:00:00Z',
      updated_at: '2025-06-11T09:12:00Z'
    }
  ];
}

/* -------------------------------------------------------------------------- */
/* Projects                                                                   */
/* -------------------------------------------------------------------------- */

const RICH_DESCRIPTION = [
  'Role: Lead modeller',
  'Duration: Feb - Aug 2025',
  'Focus: Micro-hydro screening',
  'Tools: Python, QGIS, HEC-HMS',
  '',
  'Problem:',
  'Candidate sites were being ranked from a single year of gauge data, so the',
  'yield estimate moved by a factor of three depending on which month was used.',
  '',
  '## Data and method',
  '',
  '1. Quality-control the discharge series (gap fill, outlier screen).',
  '2. Fit a flow-duration curve, then read Q40/Q60/Q80 exceedance flows.',
  '3. Convert head and flow into power with an explicit efficiency assumption.',
  '4. Map the result onto the catchment so the spatial pattern is visible.',
  '',
  '| Scenario | Flow (m³/s) | Head (m) | Power (kW) |',
  '| --- | --- | --- | --- |',
  '| Dry season (Q80) | 1.8 | 42 | 148 |',
  '| Annual mean (Q60) | 3.1 | 42 | 255 |',
  '| Wet season (Q40) | 4.4 | 42 | 362 |',
  '',
  'Action:',
  'Rebuild the curve from the full gauge record, propagate the measurement',
  'uncertainty into the power equation, and publish the pipeline as a scripted',
  'job with a fixed random seed so the screening re-runs when data is extended.',
  '',
  'Outcome:',
  'The site ranking survived a ±30 % perturbation of the efficiency assumption.',
  'Two of the six candidates dropped out entirely once dry-season flow was used.',
  '',
  'Key Learnings:',
  '- A single number hides the decision that matters.',
  '- Uncertainty is only useful when it is propagated, not quoted.',
  '- Diagrams persuaded stakeholders faster than tables did.'
].join('\n');

const SHORT_DESCRIPTION = [
  'Role: Lead modeller',
  'Duration: Feb - Aug 2025',
  '',
  'Problem:',
  'Site ranking flipped depending on which month of gauge data was used.',
  '',
  'Outcome:',
  'Rebuilt the flow-duration curve and reported a defensible power range instead of a point estimate.'
].join('\n');

const PROJECT_SEEDS = [
  {
    title: 'Catchment Yield Screening',
    slug: 'catchment-yield-screening',
    cat: 'cat-energy',
    short: SHORT_DESCRIPTION,
    full: RICH_DESCRIPTION,
    featured: true,
    priority: 5,
    role: 'Lead modeller',
    location: 'Upper catchment',
    start: '2025-02-03',
    end: '2025-08-15',
    tech: ['Python', 'pandas', 'HEC-HMS'],
    tools: ['QGIS', 'Jupyter'],
    skills: ['Hydrological modelling', 'Uncertainty analysis']
  },
  {
    title: 'Land Suitability Atlas',
    slug: 'land-suitability-atlas',
    cat: 'cat-spatial',
    short: 'Weighted overlay of slope, land cover and grid proximity into a single suitability surface.',
    full: [
      'Role: GIS analyst',
      'Duration: 2024',
      'Tools: QGIS, GDAL, PostGIS',
      '',
      '## What was built',
      '',
      'A reproducible weighted-overlay model: every constraint layer is reclassified',
      'to a 0-1 score, weighted, and summed. The weights live in a YAML file so the',
      'scenario can be re-run with a different policy.',
      '',
      'Action:',
      'Shipped a static decision-support page that renders the atlas and lets the',
      'reader toggle each constraint on and off.',
      '',
      'Outcome:',
      'Reduced the candidate long-list from 41 to 7 sites before any field survey.'
    ].join('\n'),
    featured: false,
    priority: 4,
    role: 'GIS analyst',
    location: 'Regional',
    start: '2024-03-01',
    end: '2024-11-20',
    tech: ['QGIS', 'GDAL', 'Python'],
    tools: ['PostGIS'],
    skills: ['Spatial analysis', 'Raster processing']
  },
  {
    title: 'Material Study Kit',
    slug: 'material-study-kit',
    cat: 'cat-design',
    short: 'Parametric study of a folded shell under uniform load, exported as a printable plate.',
    full: [
      'Role: Design engineer',
      'Duration: 2024',
      '',
      '**Process:**',
      'Parametrise the fold angle, sweep it, and keep the geometry under the',
      'deflection target. Then rebuild the winning variant as a physical model.',
      '',
      'Key Learnings:',
      '- The structural optimum and the manufacturable optimum are rarely the same point.'
    ].join('\n'),
    featured: false,
    priority: 3,
    role: 'Design engineer',
    location: 'Studio',
    start: '2024-01-10',
    end: '2024-06-30',
    tech: ['Grasshopper', 'Karamba'],
    tools: ['Rhino', 'Blender'],
    skills: ['Parametric design']
  },
  {
    title: 'Flow Visualisation Set',
    slug: 'flow-visualisation-set',
    cat: 'cat-design',
    short: 'A short motion piece explaining a flow-duration curve to a non-technical audience.',
    full: [
      'Role: Motion designer',
      'Duration: 2025',
      '',
      'Problem:',
      'The curve is obvious to a hydrologist and opaque to everyone else.',
      '',
      'Outcome:',
      'A 40-second piece that walks the curve left to right and lands on the three',
      'scenarios used in the report.'
    ].join('\n'),
    featured: true,
    priority: 4,
    role: 'Motion designer',
    location: 'Remote',
    start: '2025-03-01',
    end: '2025-04-12',
    tech: ['Blender', 'After Effects'],
    tools: ['Figma'],
    skills: ['Motion design']
  },
  {
    title: 'Gauge Network Audit',
    slug: 'gauge-network-audit',
    cat: 'cat-energy',
    short: 'Data-quality audit of 14 river gauges: gap length, rating-curve drift, unit consistency.',
    full: 'Audit of 14 stations. Result: three stations had a unit change mid-record, two had rating-curve drift.\n\nKey Learnings:\n- Most "outliers" are metadata errors.\n- Record a provenance note for every series you touch.',
    featured: false,
    priority: 2,
    role: 'Data analyst',
    location: 'Regional',
    start: '2024-09-01',
    end: '2024-12-15',
    tech: ['Python', 'pandas'],
    tools: ['Jupyter'],
    skills: ['Data quality']
  },
  {
    title: 'Turbine Selection Tool',
    slug: 'turbine-selection-tool',
    cat: 'cat-energy',
    short: 'Small decision tool mapping (head, flow) pairs onto a cross-flow / Pelton / Francis envelope.',
    full: 'A lookup surface over head and flow, with efficiency curves interpolated from manufacturer sheets.\n\nOutcome:\nCut selection time from an afternoon to under a minute.',
    featured: false,
    priority: 2,
    role: 'Developer',
    location: 'Desk',
    start: '2025-01-05',
    end: '2025-02-20',
    tech: ['TypeScript', 'D3'],
    tools: ['Vite'],
    skills: ['Data visualisation']
  },
  {
    title: 'Terrain Model Cleanup',
    slug: 'terrain-model-cleanup',
    cat: 'cat-spatial',
    short: 'Pipeline that stitches, resamples and hydrologically corrects an 8 m DEM for catchment work.',
    full: 'Filled sinks, enforced drainage, and resampled to a common grid before any flow routing.\n\nAction:\nPackaged as a single CLI so the same correction runs on every new tile.',
    featured: false,
    priority: 1,
    role: 'GIS analyst',
    location: 'Regional',
    start: '2024-05-01',
    end: '2024-07-01',
    tech: ['GDAL', 'Python'],
    tools: ['QGIS'],
    skills: ['DEM processing']
  },
  {
    title: 'Portfolio Render Library',
    slug: 'portfolio-render-library',
    cat: 'cat-design',
    short: 'Reusable Blender scene templates for consistent product and figure renders.',
    full: 'Three lighting rigs, one camera set, one colour pipeline. Every render in the gallery comes from these templates.',
    featured: false,
    priority: 1,
    role: '3D generalist',
    location: 'Studio',
    start: '2025-02-01',
    end: '2025-05-01',
    tech: ['Blender', 'Cycles'],
    tools: ['Photoshop'],
    skills: ['Lighting', 'Look development']
  },
  {
    title: 'Field Survey Workbook',
    slug: 'field-survey-workbook',
    cat: 'cat-spatial',
    short: 'Offline-first survey form collecting head, flow and photo evidence per candidate site.',
    full: 'Works without connectivity, syncs when it returns, and stamps every record with GPS accuracy.\n\nOutcome:\nSurvey time per site dropped by roughly a third.',
    featured: false,
    priority: 1,
    role: 'Field engineer',
    location: 'Field',
    start: '2025-04-01',
    end: null,
    tech: ['PWA', 'IndexedDB'],
    tools: ['QGIS'],
    skills: ['Fieldwork']
  }
];

function projects() {
  return PROJECT_SEEDS.map((p, i) => ({
    id: id(200 + i),
    slug: p.slug,
    title: p.title,
    short_description: p.short,
    full_description: p.full,
    category_id: catId(p.cat),
    status: i === 8 ? 'draft' : 'published',
    start_date: p.start,
    completion_date: p.end,
    location: p.location,
    role: p.role,
    team: i % 3 === 0 ? 'Solo' : 'Two-person team',
    technologies: p.tech,
    tools: p.tools,
    technical_skills: p.skills,
    methodology: '',
    technical_specifications: '',
    key_achievements: '',
    project_outcomes: '',
    thumbnail_url: IMG(`project-${i + 1}`),
    thumbnail_alt: `${p.title} thumbnail (placeholder art)`,
    cover_url: IMG(`project-${i + 1}`),
    cover_alt: `${p.title} cover (placeholder art)`,
    video_url: null,
    live_url: i === 1 ? 'https://example.com/atlas' : null,
    github_url: i === 5 ? 'https://github.com/example/turbine-tool' : null,
    documentation_url: null,
    publication_url: null,
    related_resources: i === 0 ? [{ label: 'Method note', url: 'https://example.com/method' }] : [],
    featured: p.featured,
    include_in_works: i !== 8,
    display_priority: p.priority,
    sort_order: i,
    created_at: `2025-0${(i % 9) + 1}-02T08:00:00Z`,
    updated_at: '2025-06-02T11:30:00Z'
  }));
}

function projectMedia() {
  const rows = [];
  let n = 0;
  for (let p = 0; p < 4; p += 1) {
    for (let m = 0; m < 3; m += 1) {
      rows.push({
        id: id(300 + n),
        project_id: id(200 + p),
        url: IMG(`gallery-${30 + n}`),
        caption: `Figure ${m + 1} - ${m === 0 ? 'site overview' : m === 1 ? 'model output' : 'detail view'}`,
        alt: 'Placeholder figure',
        sort_order: m,
        created_at: '2025-03-01T08:00:00Z'
      });
      n += 1;
    }
  }
  return rows;
}

/* -------------------------------------------------------------------------- */
/* Experiences                                                                */
/* -------------------------------------------------------------------------- */

function experiences() {
  const seeds = [
    {
      slug: 'research-assistant',
      organization_name: 'Applied Energy Lab',
      position: 'Research Assistant',
      employment_type: 'Part-time',
      location: 'Campus',
      start: '2024-02-01',
      end: '2025-05-31',
      current: false,
      short: 'Built the yield-screening pipeline used by the lab for micro-hydro candidates.',
      include: true
    },
    {
      slug: 'gis-intern',
      organization_name: 'Regional Planning Office',
      position: 'GIS Intern',
      employment_type: 'Internship',
      location: 'Regional',
      start: '2024-06-01',
      end: '2024-08-31',
      current: false,
      short: 'Produced the land-suitability atlas and the reproducible overlay model behind it.',
      include: true
    },
    {
      slug: 'design-contractor',
      organization_name: 'Independent',
      position: '3D & Motion Contractor',
      employment_type: 'Freelance',
      location: 'Remote',
      start: '2023-01-01',
      end: null,
      current: true,
      short: 'Product and architectural visualisation for small studios.',
      include: false
    },
    {
      slug: 'lab-demonstrator',
      organization_name: 'Physics Department',
      position: 'Laboratory Demonstrator',
      employment_type: 'Part-time',
      location: 'Campus',
      start: '2022-09-01',
      end: '2023-06-30',
      current: false,
      short: 'Ran the mechanics and fluid-mechanics practicum sessions.',
      include: true
    }
  ];
  return seeds.map((e, i) => ({
    id: id(400 + i),
    slug: e.slug,
    title: '',
    organization_name: e.organization_name,
    position: e.position,
    short_description: e.short,
    employment_type: e.employment_type,
    location: e.location,
    start_date: e.start,
    end_date: e.end,
    currently_working: e.current,
    description: [
      `Role: ${e.position}`,
      `Organization: ${e.organization_name}`,
      '',
      '## Responsibilities',
      '',
      '- Maintain the modelling pipeline and its documentation.',
      '- Review incoming datasets before they enter the analysis.',
      '',
      'Achievements:',
      'Cut the screening turnaround from two weeks to two days.'
    ].join('\n'),
    responsibilities: '',
    achievements: '',
    skills: ['Hydrology', 'Python', 'QGIS'].slice(0, 2 + (i % 2)),
    logo_url: IMG(`logo-${i + 1}`),
    media: [{ url: IMG(`gallery-${40 + i}`), caption: 'Placeholder', alt: '' }],
    external_links: [],
    include_in_works: e.include,
    display_priority: 3,
    sort_order: i,
    status: i === 3 ? 'draft' : 'published',
    created_at: `2024-0${(i % 9) + 1}-15T08:00:00Z`,
    updated_at: '2025-05-20T07:45:00Z'
  }));
}

/* -------------------------------------------------------------------------- */
/* Education / skills / organizations / gallery                               */
/* -------------------------------------------------------------------------- */

function education() {
  return [
    {
      id: id(500),
      institution: 'State Institute of Technology',
      degree: 'B.Eng.',
      field_of_study: 'Engineering Physics',
      start_date: '2021-08-01',
      graduation_date: '2025-08-01',
      description: 'Focus on energy conversion, computational methods and instrumentation.',
      achievements: '',
      relevant_coursework: ['Thermodynamics', 'Fluid mechanics', 'Numerical methods', 'Remote sensing'],
      logo_url: IMG('logo-1'),
      documents: [],
      display_order: 0,
      status: 'published',
      created_at: '2024-01-01T08:00:00Z',
      updated_at: '2025-01-01T08:00:00Z'
    },
    {
      id: id(501),
      institution: 'Regional High School',
      degree: '',
      field_of_study: 'Science track',
      start_date: '2018-07-01',
      graduation_date: '2021-05-31',
      description: '',
      achievements: '',
      relevant_coursework: [],
      logo_url: null,
      documents: [],
      display_order: 1,
      status: 'published',
      created_at: '2024-01-01T08:00:00Z',
      updated_at: '2024-01-01T08:00:00Z'
    }
  ];
}

function skills() {
  const seeds = [
    ['Hydrological modelling', 'cat-sim'],
    ['Uncertainty analysis', 'cat-sim'],
    ['FEA', 'cat-sim'],
    ['Python', 'cat-code'],
    ['TypeScript', 'cat-code'],
    ['SQL', 'cat-code'],
    ['QGIS', 'cat-gis'],
    ['GDAL', 'cat-gis'],
    ['PostGIS', 'cat-gis'],
    ['Blender', 'cat-3d'],
    ['After Effects', 'cat-3d'],
    ['Rhino / Grasshopper', 'cat-3d']
  ];
  return seeds.map(([name, cat], i) => ({
    id: id(600 + i),
    name,
    category_id: catId(cat),
    proficiency_level: ['intermediate', 'advanced', 'expert'][i % 3],
    proficiency_percent: 55 + ((i * 3) % 40),
    show_proficiency: false,
    description: '',
    icon_url: null,
    related_projects: [],
    sort_order: i,
    status: 'published',
    created_at: '2024-01-01T08:00:00Z',
    updated_at: '2025-02-01T08:00:00Z'
  }));
}

function organizations() {
  return [
    {
      id: id(700),
      slug: 'engineering-society',
      organization_name: 'Engineering Society',
      position: 'Head of Research Division',
      organization_type: 'Student organization',
      description: 'Coordinated four student research groups.',
      responsibilities: '',
      achievements: '',
      start_date: '2023-09-01',
      end_date: '2024-08-31',
      logo_url: IMG('logo-2'),
      related_experiences: [],
      external_links: [],
      sort_order: 0,
      status: 'published',
      created_at: '2024-01-01T08:00:00Z',
      updated_at: '2024-09-01T08:00:00Z'
    },
    {
      id: id(701),
      slug: 'design-collective',
      organization_name: 'Design Collective',
      position: 'Member',
      organization_type: 'Community',
      description: 'Open studio nights and critique sessions.',
      responsibilities: '',
      achievements: '',
      start_date: '2022-02-01',
      end_date: null,
      logo_url: IMG('logo-3'),
      related_experiences: [],
      external_links: [],
      sort_order: 1,
      status: 'published',
      created_at: '2024-01-01T08:00:00Z',
      updated_at: '2024-09-01T08:00:00Z'
    }
  ];
}

function gallery() {
  const titles = ['Ridge line', 'Concrete stair', 'Cable stay', 'Vent detail', 'Facade rhythm', 'Long exposure'];
  return titles.map((title, i) => ({
    id: id(800 + i),
    title,
    description: '',
    category_id: catId(i < 3 ? 'cat-photo' : i < 5 ? 'cat-texture' : 'cat-light'),
    location: 'Somewhere',
    capture_date: `2024-0${(i % 9) + 1}-12`,
    image_url: IMG(`photo-${i + 1}`),
    alt_text: `${title} (placeholder art)`,
    featured: i < 2,
    sort_order: i,
    status: 'published',
    created_at: '2024-02-01T08:00:00Z',
    updated_at: '2024-02-01T08:00:00Z'
  }));
}

function documents() {
  return [
    {
      id: id(900),
      title: 'Curriculum Vitae 2025',
      description: 'Current CV.',
      doc_type: 'cv',
      file_url: '/demo-cv.pdf',
      storage_path: 'documents/demo/cv-2025.pdf',
      mime_type: 'application/pdf',
      file_size: 184320,
      version: '2025.2',
      is_active: true,
      uploaded_at: '2025-05-01T08:00:00Z',
      updated_at: '2025-05-01T08:00:00Z'
    },
    {
      id: id(901),
      title: 'Curriculum Vitae 2024',
      description: 'Superseded.',
      doc_type: 'cv',
      file_url: '/demo-cv-2024.pdf',
      storage_path: 'documents/demo/cv-2024.pdf',
      mime_type: 'application/pdf',
      file_size: 176128,
      version: '2024.4',
      is_active: false,
      uploaded_at: '2024-11-01T08:00:00Z',
      updated_at: '2024-11-01T08:00:00Z'
    },
    {
      id: id(902),
      title: 'Portfolio (print)',
      description: 'Selected works.',
      doc_type: 'portfolio',
      file_url: '/demo-portfolio.pdf',
      storage_path: 'documents/demo/portfolio.pdf',
      mime_type: 'application/pdf',
      file_size: 2408448,
      version: '1.0',
      is_active: true,
      uploaded_at: '2025-03-10T08:00:00Z',
      updated_at: '2025-03-10T08:00:00Z'
    },
    {
      id: id(903),
      title: 'Modelling certificate',
      description: '',
      doc_type: 'certificate',
      file_url: '/demo-certificate.pdf',
      storage_path: 'documents/demo/certificate.pdf',
      mime_type: 'application/pdf',
      file_size: 98304,
      version: '',
      is_active: true,
      uploaded_at: '2024-12-01T08:00:00Z',
      updated_at: '2024-12-01T08:00:00Z'
    }
  ];
}

function socialLinks() {
  return [
    { id: id(1000), platform: 'email', label: 'Email', url: 'mailto:hello@example.com', icon: 'mail', sort_order: 0, visible: true },
    { id: id(1001), platform: 'linkedin', label: 'LinkedIn', url: 'https://linkedin.com/in/example', icon: 'work', sort_order: 1, visible: true },
    { id: id(1002), platform: 'github', label: 'GitHub', url: 'https://github.com/example', icon: 'code', sort_order: 2, visible: true }
  ].map((r) => ({ ...r, created_at: '2024-01-01T08:00:00Z', updated_at: '2024-01-01T08:00:00Z' }));
}

function siteImages() {
  const keys = [
    'profile_image', 'about_image', 'hero_background',
    'project1_image', 'project2_image', 'project3_image',
    'exp1_image', 'exp2_image',
    'gallery1_image', 'gallery2_image', 'gallery3_image',
    'photo1_image', 'photo2_image', 'photo3_image', 'contact_image'
  ];
  return keys.map((key, i) => ({
    key,
    url: IMG(i === 0 ? 'portrait' : i < 3 ? `hero-${i}` : `gallery-${i}`),
    alt: 'Placeholder art',
    caption: '',
    updated_at: '2025-01-01T08:00:00Z'
  }));
}

function siteSettings() {
  const rows = [
    ['text_alignment', 'text-justify', 'Body text alignment'],
    ['contact_heading', "Let's talk energy systems", 'Contact section heading'],
    ['contact_body', 'Open for research collaborations, modelling work, or a conversation about how a screening model should be read.', 'Contact section body'],
    ['contact_email', 'hello@example.com', 'Contact email address'],
    ['photography_heading', 'Photography', 'Photography section heading'],
    [
      'photography_description',
      'Studies of structure, texture and light - the same visual discipline the technical work relies on.',
      'Photography section description'
    ],
    ['motion_heading', 'Motion in Frames.', 'Motion gallery section heading'],
    [
      'motion_description',
      'An archive of moving images, visual experiments, and the creative process behind selected works.',
      'Motion gallery section description'
    ],
    ['render3d_heading', 'Rendered Studies.', '3D renders section heading'],
    [
      'render3d_description',
      'Stills from the render library - lighting studies, material tests and finished scenes.',
      '3D renders section description'
    ],
    ['render3d_hint', 'Drag a print to swing the line. Click to open the plate.', '3D renders interaction hint'],
    ['site_title', 'Morgan Ellery - Portfolio', 'Site title'],
    ['meta_description', 'Energy systems, spatial analysis and visual design.', 'Meta description']
  ];
  return rows.map(([key, value, label]) => ({
    key,
    value,
    label,
    updated_at: '2025-06-01T08:00:00Z'
  }));
}

/* -------------------------------------------------------------------------- */
/* Galleries (0006 / 0008)                                                    */
/* -------------------------------------------------------------------------- */

function motionMedia() {
  const seeds = [
    ['Flow curve explainer', 'flow-curve', '16:9', '00:40', 'final_render', ['Blender', 'After Effects']],
    ['Turbine assembly', 'turbine-assembly', '16:9', '01:12', 'final_render', ['Blender']],
    ['Site flythrough', 'site-flythrough', '21:9', '00:58', 'final_render', ['Blender', 'QGIS']],
    ['Material test loop', 'material-test', '1:1', '00:12', 'behind_the_scenes', ['Blender']],
    ['Lighting breakdown', 'lighting-breakdown', '16:9', '02:05', 'combined', ['Blender']],
    ['Contact sheet', 'contact-sheet', '4:5', '00:20', 'behind_the_scenes', ['Photoshop']],
    ['Render pass reel', 'render-pass-reel', '16:9', '00:33', 'final_render', ['Nuke']]
  ];
  return seeds.map(([title, slug, ratio, duration, kind, software], i) => ({
    id: id(1100 + i),
    project_id: 'render-library',
    slug,
    title,
    description: 'Placeholder entry used by the demo dataset.',
    media_type: kind,
    video_url: '',
    video_provider: 'upload',
    poster_url: IMG(`motion-${i + 1}`),
    thumb_url: IMG(`motion-${i + 1}`),
    aspect_ratio: ratio,
    duration,
    year: '2025',
    category: 'Motion',
    software,
    rotation: [0, 90, 0, 180, 0, 270, 0][i],
    display_order: i,
    status: 'published',
    is_published: true,
    created_at: '2025-03-01T08:00:00Z',
    updated_at: '2025-03-01T08:00:00Z'
  }));
}

function render3d() {
  const seeds = [
    ['Figurine study', 'figurine', '4:5', 'Character', 0],
    ['Product shell', 'shell', '4:5', 'Product', 0],
    ['Hard-surface prop', 'prop', '4:5', 'Prop', 90],
    ['Material sphere grid', 'spheres', '1:1', 'Study', 0],
    ['Environment still', 'environment', '16:9', 'Environment', 0]
  ];
  return seeds.map(([title, slug, ratio, category, rotation], i) => ({
    id: id(1200 + i),
    project_id: 'render-library',
    slug,
    title,
    description: 'Stills from the render library.',
    image_url: IMG(`render-${i + 1}`),
    thumb_url: IMG(`render-${i + 1}`),
    aspect_ratio: ratio,
    year: '2025',
    category,
    kind: category,
    software: ['Blender', 'Cycles'],
    rotation,
    display_order: i,
    status: 'published',
    is_published: true,
    created_at: '2025-04-01T08:00:00Z',
    updated_at: '2025-04-01T08:00:00Z'
  }));
}

function adminUsers() {
  return [
    {
      user_id: '00000000-0000-4000-9000-000000000001',
      role: 'admin',
      created_at: '2025-01-04T08:00:00Z'
    }
  ];
}

/* -------------------------------------------------------------------------- */

export function demoDataset() {
  return {
    admin_users: adminUsers(),
    content_categories: categories(),
    profiles: profiles(),
    projects: projects(),
    project_media: projectMedia(),
    experiences: experiences(),
    education: education(),
    skills: skills(),
    organizations: organizations(),
    gallery: gallery(),
    documents: documents(),
    social_links: socialLinks(),
    site_images: siteImages(),
    site_settings: siteSettings(),
    motion_media: motionMedia(),
    render_3d: render3d()
  };
}

/** The demo admin account (fictional, local-only). */
export const DEMO_ACCOUNT = {
  email: 'admin@example.com',
  password: 'demo-password',
  userId: '00000000-0000-4000-9000-000000000001'
};