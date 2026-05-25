import { NAV_ITEMS } from './constants.js';
import { subscribe, exportData, importData } from './store.js';
import { showToast } from './ui.js';
import {
  setNavigator,
  renderDashboard,
  bindDashboard,
  renderQuickLog,
  bindQuickLog,
  renderCreatorsContacted,
  bindCreatorsContacted,
  renderBrandsContacted,
  bindBrandsContacted,
  renderSignedCreators,
  bindSignedCreators,
  renderSignedBrands,
  bindSignedBrands,
  renderCampaigns,
  bindCampaigns,
  renderBrandDetail,
  bindBrandDetail,
  renderCreatorDetail,
  bindCreatorDetail,
  renderHelp,
  bindHelp,
  openSignedCreatorChoice,
  openCampaignForm,
} from './pages.js';

const ROUTES = {
  '/': { title: 'Dashboard', subtitle: 'Your influencer agency operating system', render: renderDashboard, bind: bindDashboard },
  '/quick-log': { title: 'Quick Log Sponsorship', subtitle: 'Log external brand–creator relationships from research', render: renderQuickLog, bind: bindQuickLog, action: null },
  '/creators-contacted': { title: 'Creators Contacted', subtitle: 'Track creators you have reached out to', render: renderCreatorsContacted, bind: bindCreatorsContacted },
  '/brands-contacted': { title: 'Brands Contacted', subtitle: 'Track brands you have reached out to', render: renderBrandsContacted, bind: bindBrandsContacted },
  '/signed-creators': { title: 'Signed Creators', subtitle: 'Creators you currently represent', render: renderSignedCreators, bind: bindSignedCreators, action: { label: '+ Add Signed', fn: openSignedCreatorChoice } },
  '/signed-brands': { title: 'Signed Brands', subtitle: 'Brands you currently work with', render: renderSignedBrands, bind: bindSignedBrands },
  '/campaigns': { title: 'Campaigns', subtitle: 'Deals between your signed creators and brands', render: renderCampaigns, bind: bindCampaigns, action: { label: '+ Create Campaign', fn: openCampaignForm } },
  '/help': { title: 'How to Use', subtitle: 'Everything you need to get started with InfluenceFlow', render: renderHelp, bind: bindHelp },
};

function parseRoute() {
  const hash = location.hash.slice(1) || '/';
  const brandMatch = hash.match(/^\/brand\/(.+)$/);
  if (brandMatch) return { path: hash, type: 'brand', id: brandMatch[1] };
  const creatorMatch = hash.match(/^\/creator\/(.+)$/);
  if (creatorMatch) return { path: hash, type: 'creator', id: creatorMatch[1] };
  return { path: hash.split('?')[0], type: 'static' };
}

function renderNav() {
  const nav = document.getElementById('nav');
  const current = parseRoute().path;
  nav.innerHTML = NAV_ITEMS.map((section) => `
    <div class="nav-section">${section.section}</div>
    ${section.items.map((item) => `
      <a class="nav-link${current === item.route ? ' active' : ''}" href="#${item.route}" data-route="${item.route}">
        <span class="nav-icon">${item.icon}</span>${item.label}
      </a>
    `).join('')}
  `).join('');
}

function render() {
  const route = parseRoute();
  renderNav();

  const content = document.getElementById('content');
  const titleEl = document.getElementById('page-title');
  const subtitleEl = document.getElementById('page-subtitle');
  const actionsEl = document.getElementById('topbar-actions');
  actionsEl.innerHTML = '';

  if (route.type === 'brand') {
    titleEl.textContent = 'Brand Details';
    subtitleEl.textContent = 'External creators, campaigns, and pitch safety';
    content.innerHTML = renderBrandDetail(route.id);
    bindBrandDetail(content, route.id);
    return;
  }

  if (route.type === 'creator') {
    titleEl.textContent = 'Creator Details';
    subtitleEl.textContent = 'Campaigns, payouts, and brand relationships';
    content.innerHTML = renderCreatorDetail(route.id);
    bindCreatorDetail(content, route.id);
    return;
  }

  const def = ROUTES[route.path] || ROUTES['/'];
  titleEl.textContent = def.title;
  subtitleEl.textContent = def.subtitle;
  content.innerHTML = def.render();

  if (def.action) {
    actionsEl.innerHTML = `<button type="button" class="btn btn-primary" id="topbar-action">${def.action.label}</button>`;
    document.getElementById('topbar-action').addEventListener('click', def.action.fn);
  }

  def.bind(content);
}

function navigate(path) {
  location.hash = path;
}

function initExportImport() {
  document.getElementById('export-data').addEventListener('click', () => {
    const blob = new Blob([exportData()], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `influenceflow-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    showToast('Data exported');
  });

  const fileInput = document.getElementById('import-file');
  document.getElementById('import-data').addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', () => {
    const file = fileInput.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        importData(reader.result);
        showToast('Data imported successfully');
        render();
      } catch {
        showToast('Invalid backup file', 'error');
      }
    };
    reader.readAsText(file);
    fileInput.value = '';
  });
}

setNavigator(navigate);
subscribe(() => render());
window.addEventListener('hashchange', render);
initExportImport();
render();
