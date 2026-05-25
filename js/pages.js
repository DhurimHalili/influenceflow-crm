import {
  CREATOR_STATUSES,
  BRAND_STATUSES,
  CAMPAIGN_STATUSES,
  RELATIONSHIP_TYPES,
  PLATFORMS,
  formatDate,
  formatMoney,
  formatViews,
  todayISO,
  escapeHtml,
  labelFor,
} from './constants.js';
import {
  getState,
  getStats,
  addCreatorContacted,
  updateCreatorContacted,
  deleteCreatorContacted,
  bulkImportCreators,
  addBrandContacted,
  updateBrandContacted,
  deleteBrandContacted,
  bulkImportBrands,
  promoteToSignedCreator,
  addSignedCreator,
  updateSignedCreator,
  deleteSignedCreator,
  getSignedCreator,
  promoteToSignedBrand,
  addSignedBrand,
  updateSignedBrand,
  deleteSignedBrand,
  getSignedBrand,
  addExternalLink,
  deleteExternalLink,
  getExternalLinksForBrand,
  getCreatorsSafeToPitch,
  getConflictForCampaign,
  addCampaign,
  updateCampaign,
  deleteCampaign,
  getCampaign,
  getCampaignsForBrand,
  getCampaignsForCreator,
} from './store.js';
import {
  openModal,
  closeModal,
  bindForm,
  renderOptions,
  renderEmpty,
  statusBadge,
  showToast,
  confirmDialog,
  matchesSearch,
} from './ui.js';

let navigateFn = () => {};

export function setNavigator(fn) {
  navigateFn = fn;
}

function nav(path) {
  navigateFn(path);
}

// --- Dashboard ---

export function renderDashboard() {
  const { activity } = getState();
  const stats = getStats();

  return `
    <div class="grid-stats">
      <div class="stat-card"><div class="stat-label">Creators Contacted</div><div class="stat-value">${stats.creatorsContacted}</div></div>
      <div class="stat-card"><div class="stat-label">Brands Contacted</div><div class="stat-value">${stats.brandsContacted}</div></div>
      <div class="stat-card"><div class="stat-label">Signed Creators</div><div class="stat-value">${stats.signedCreators}</div></div>
      <div class="stat-card"><div class="stat-label">Signed Brands</div><div class="stat-value">${stats.signedBrands}</div></div>
      <div class="stat-card"><div class="stat-label">Active Campaigns</div><div class="stat-value">${stats.activeCampaigns}</div><div class="stat-meta">${stats.totalCampaigns} total</div></div>
      <div class="stat-card"><div class="stat-label">Agency Revenue</div><div class="stat-value revenue-highlight">${formatMoney(stats.agencyRevenue)}</div><div class="stat-meta">${formatMoney(stats.activeRevenue)} in active deals</div></div>
    </div>
    <div class="grid-2">
      <div class="card">
        <div class="card-header"><h2>Recent Activity</h2></div>
        <div class="card-body">
          ${activity.length ? `
            <div class="activity-list">
              ${activity.slice(0, 12).map((a) => `
                <div class="activity-item">
                  <span class="activity-time">${formatDate(a.at)}</span>
                  <span class="activity-text">${a.text}</span>
                </div>
              `).join('')}
            </div>
          ` : renderEmpty('No activity yet. Start adding contacts!')}
        </div>
      </div>
      <div class="card">
        <div class="card-header"><h2>Quick Actions</h2></div>
        <div class="card-body" style="display:flex;flex-direction:column;gap:10px;">
          <button type="button" class="btn btn-primary" data-go="/quick-log">⚡ Log Sponsorship</button>
          <button type="button" class="btn btn-secondary" data-go="/signed-creators">⭐ Add Signed Creator</button>
          <button type="button" class="btn btn-secondary" data-go="/campaigns">🎯 Create Campaign</button>
          <button type="button" class="btn btn-secondary" data-go="/creators-contacted">👤 Import Creators</button>
        </div>
      </div>
    </div>
  `;
}

export function bindDashboard(root) {
  root.querySelectorAll('[data-go]').forEach((btn) => {
    btn.addEventListener('click', () => nav(btn.dataset.go));
  });
}

// --- Quick Log Sponsorship ---

export function renderQuickLog() {
  const { signedBrands } = getState();
  return `
    <div class="card" style="max-width:720px;">
      <div class="card-header">
        <div>
          <h2>Quick Log Sponsorship</h2>
          <p class="subtitle" style="margin-top:4px;">Research intel — NOT a campaign. Log when you spot a brand sponsoring a creator.</p>
        </div>
      </div>
      <div class="card-body">
        <div class="alert alert-info">This creates an <strong>External Creator Link</strong> on the brand page. It will warn you later if you try to pitch that creator to the same brand.</div>
        <form id="quick-log-form">
          <div class="form-grid">
            <div class="form-group">
              <label>Brand name *</label>
              <input class="input" name="brandName" list="brand-list" required placeholder="e.g. NordVPN" />
              <datalist id="brand-list">${signedBrands.map((b) => `<option value="${escapeHtml(b.name)}">`).join('')}</datalist>
            </div>
            <div class="form-group">
              <label>Creator name *</label>
              <input class="input" name="creatorName" required placeholder="e.g. MrBeast" />
            </div>
            <div class="form-group">
              <label>Platform</label>
              <select class="select-input" name="platform">${renderOptions(PLATFORMS, 'YouTube')}</select>
            </div>
            <div class="form-group">
              <label>Relationship type</label>
              <select class="select-input" name="relationshipType">${renderOptions(RELATIONSHIP_TYPES, 'external')}</select>
            </div>
            <div class="form-group full">
              <label>Video / post link</label>
              <input class="input" name="videoLink" placeholder="https://youtube.com/..." />
            </div>
            <div class="form-group full">
              <label>Channel / profile link</label>
              <input class="input" name="channelLink" placeholder="https://..." />
            </div>
            <div class="form-group full">
              <label>Notes</label>
              <textarea class="textarea" name="notes" placeholder="Sponsored segment at 2:30, etc."></textarea>
            </div>
          </div>
          <div style="margin-top:16px;display:flex;gap:8px;">
            <button type="submit" class="btn btn-primary">Log Sponsorship</button>
          </div>
        </form>
      </div>
    </div>
  `;
}

export function bindQuickLog(root) {
  const form = root.querySelector('#quick-log-form');
  bindForm(form, (data) => {
    const result = addExternalLink(data);
    if (result.error) { showToast(result.error, 'error'); return; }
    showToast(`Logged ${data.creatorName} ↔ ${result.brand.name}`);
    form.reset();
    nav(`/brand/${result.brand.id}`);
  });
}

// --- Creators Contacted ---

export function renderCreatorsContacted() {
  const { creatorsContacted } = getState();
  const niches = [...new Set(creatorsContacted.map((c) => c.niche).filter(Boolean))];

  return `
    <div class="toolbar" id="filters">
      <input class="search-input" name="q" placeholder="Search name, email, niche, link..." />
      <select class="select-input" name="status" style="width:auto;">
        <option value="">All statuses</option>
        ${renderOptions(CREATOR_STATUSES)}
      </select>
      <select class="select-input" name="niche" style="width:auto;">
        <option value="">All niches</option>
        ${niches.map((n) => `<option value="${escapeHtml(n)}">${escapeHtml(n)}</option>`).join('')}
      </select>
      <button type="button" class="btn btn-primary" data-add-creator>+ Add Creator</button>
      <button type="button" class="btn btn-secondary" data-bulk-import>Bulk Import</button>
    </div>
    <div class="card"><div class="table-wrap"><table>
      <thead><tr><th>Name</th><th>Email</th><th>Niche</th><th>Avg Views</th><th>Status</th><th>Contacted</th><th></th></tr></thead>
      <tbody id="creators-tbody">${renderCreatorsRows(creatorsContacted)}</tbody>
    </table></div></div>
  `;
}

function renderCreatorsRows(list) {
  if (!list.length) return `<tr><td colspan="7">${renderEmpty('No creators yet')}</td></tr>`;
  return list.map((c) => `
    <tr>
      <td><strong>${escapeHtml(c.name)}</strong>${c.channelLink ? `<br><a class="link" href="${escapeHtml(c.channelLink)}" target="_blank" rel="noopener">Channel ↗</a>` : ''}</td>
      <td>${c.contactEmail ? `<a class="link" href="mailto:${escapeHtml(c.contactEmail)}">${escapeHtml(c.contactEmail)}</a>` : '—'}</td>
      <td>${escapeHtml(c.niche || '—')}</td>
      <td>${formatViews(c.avgViews)}</td>
      <td>${statusBadge(c.status, CREATOR_STATUSES)}</td>
      <td>${formatDate(c.dateContacted)}</td>
      <td class="actions-cell">
        <button type="button" class="btn btn-ghost btn-sm" data-edit-creator="${c.id}">Edit</button>
        <button type="button" class="btn btn-danger btn-sm" data-del-creator="${c.id}">Delete</button>
      </td>
    </tr>
  `).join('');
}

export function bindCreatorsContacted(root) {
  const filters = root.querySelector('#filters');
  const tbody = root.querySelector('#creators-tbody');

  const refresh = () => {
    const q = filters.querySelector('[name="q"]').value.toLowerCase();
    const status = filters.querySelector('[name="status"]').value;
    const niche = filters.querySelector('[name="niche"]').value.toLowerCase();
    const list = getState().creatorsContacted.filter((c) =>
      matchesSearch(q, c.name, c.contactEmail, c.niche, c.channelLink, c.notes) &&
      (!status || c.status === status) &&
      (!niche || (c.niche || '').toLowerCase().includes(niche)),
    );
    tbody.innerHTML = renderCreatorsRows(list);
    bindCreatorRowActions(root);
  };

  filters.querySelectorAll('input, select').forEach((el) => el.addEventListener('input', refresh));

  root.querySelector('[data-add-creator]').addEventListener('click', () => openCreatorForm());
  root.querySelector('[data-bulk-import]').addEventListener('click', () => openBulkImport('creators'));
  bindCreatorRowActions(root);
}

function bindCreatorRowActions(root) {
  root.querySelectorAll('[data-edit-creator]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const c = getState().creatorsContacted.find((x) => x.id === btn.dataset.editCreator);
      if (c) openCreatorForm(c);
    });
  });
  root.querySelectorAll('[data-del-creator]').forEach((btn) => {
    btn.addEventListener('click', () => {
      confirmDialog('Delete creator?', 'This cannot be undone.', () => {
        deleteCreatorContacted(btn.dataset.delCreator);
        showToast('Creator deleted');
        nav('/creators-contacted');
      });
    });
  });
}

function openCreatorForm(existing) {
  openModal({
    title: existing ? 'Edit Creator' : 'Add Creator',
    body: `
      <form id="creator-form">
        <div class="form-grid">
          <div class="form-group"><label>Name *</label><input class="input" name="name" required value="${escapeHtml(existing?.name || '')}" /></div>
          <div class="form-group"><label>Email</label><input class="input" type="email" name="contactEmail" value="${escapeHtml(existing?.contactEmail || '')}" placeholder="creator@email.com" /></div>
          <div class="form-group"><label>Niche</label><input class="input" name="niche" value="${escapeHtml(existing?.niche || '')}" /></div>
          <div class="form-group"><label>Avg views <span style="font-weight:400;color:var(--text-dim)">(optional)</span></label><input class="input" type="number" name="avgViews" min="0" step="1" value="${existing?.avgViews ?? ''}" placeholder="e.g. 500000" /></div>
          <div class="form-group full"><label>Channel link</label><input class="input" name="channelLink" value="${escapeHtml(existing?.channelLink || '')}" /></div>
          <div class="form-group"><label>Date contacted</label><input class="input" type="date" name="dateContacted" value="${existing?.dateContacted || todayISO()}" /></div>
          <div class="form-group"><label>Status</label><select class="select-input" name="status">${renderOptions(CREATOR_STATUSES, existing?.status || 'no_reply')}</select></div>
          <div class="form-group full"><label>Notes</label><textarea class="textarea" name="notes">${escapeHtml(existing?.notes || '')}</textarea></div>
        </div>
        <button type="submit" class="btn btn-primary" style="margin-top:16px;">Save</button>
      </form>
    `,
  });
  bindForm(document.getElementById('creator-form'), (data) => {
    const result = existing ? updateCreatorContacted(existing.id, data) : addCreatorContacted(data);
    if (result.error) { showToast(result.error, 'error'); return; }
    closeModal();
    showToast(existing ? 'Creator updated' : 'Creator added');
    nav('/creators-contacted');
  });
}

// --- Brands Contacted ---

export function renderBrandsContacted() {
  const { brandsContacted } = getState();
  return `
    <div class="toolbar" id="filters">
      <input class="search-input" name="q" placeholder="Search name, email..." />
      <select class="select-input" name="status" style="width:auto;">
        <option value="">All statuses</option>
        ${renderOptions(BRAND_STATUSES)}
      </select>
      <button type="button" class="btn btn-primary" data-add-brand>+ Add Brand</button>
      <button type="button" class="btn btn-secondary" data-bulk-import>Bulk Import</button>
    </div>
    <div class="card"><div class="table-wrap"><table>
      <thead><tr><th>Brand</th><th>Email</th><th>Status</th><th>Contacted</th><th></th></tr></thead>
      <tbody id="brands-tbody">${renderBrandsRows(brandsContacted)}</tbody>
    </table></div></div>
  `;
}

function renderBrandsRows(list) {
  if (!list.length) return `<tr><td colspan="5">${renderEmpty('No brands yet')}</td></tr>`;
  return list.map((b) => `
    <tr>
      <td><strong>${escapeHtml(b.name)}</strong></td>
      <td>${b.contactEmail ? `<a class="link" href="mailto:${escapeHtml(b.contactEmail)}">${escapeHtml(b.contactEmail)}</a>` : '—'}</td>
      <td>${statusBadge(b.status, BRAND_STATUSES)}</td>
      <td>${formatDate(b.dateContacted)}</td>
      <td class="actions-cell">
        <button type="button" class="btn btn-ghost btn-sm" data-edit-brand="${b.id}">Edit</button>
        <button type="button" class="btn btn-danger btn-sm" data-del-brand="${b.id}">Delete</button>
      </td>
    </tr>
  `).join('');
}

export function bindBrandsContacted(root) {
  const filters = root.querySelector('#filters');
  const tbody = root.querySelector('#brands-tbody');
  const refresh = () => {
    const q = filters.querySelector('[name="q"]').value.toLowerCase();
    const status = filters.querySelector('[name="status"]').value;
    const list = getState().brandsContacted.filter((b) =>
      matchesSearch(q, b.name, b.contactEmail, b.notes) && (!status || b.status === status),
    );
    tbody.innerHTML = renderBrandsRows(list);
    bindBrandRowActions(root);
  };
  filters.querySelectorAll('input, select').forEach((el) => el.addEventListener('input', refresh));
  root.querySelector('[data-add-brand]').addEventListener('click', () => openBrandForm());
  root.querySelector('[data-bulk-import]').addEventListener('click', () => openBulkImport('brands'));
  bindBrandRowActions(root);
}

function bindBrandRowActions(root) {
  root.querySelectorAll('[data-edit-brand]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const b = getState().brandsContacted.find((x) => x.id === btn.dataset.editBrand);
      if (b) openBrandForm(b);
    });
  });
  root.querySelectorAll('[data-del-brand]').forEach((btn) => {
    btn.addEventListener('click', () => {
      confirmDialog('Delete brand?', 'This cannot be undone.', () => {
        deleteBrandContacted(btn.dataset.delBrand);
        showToast('Brand deleted');
        nav('/brands-contacted');
      });
    });
  });
}

function openBrandForm(existing) {
  openModal({
    title: existing ? 'Edit Brand' : 'Add Brand',
    body: `
      <form id="brand-form">
        <div class="form-grid">
          <div class="form-group"><label>Brand name *</label><input class="input" name="name" required value="${escapeHtml(existing?.name || '')}" /></div>
          <div class="form-group"><label>Email</label><input class="input" type="email" name="contactEmail" value="${escapeHtml(existing?.contactEmail || '')}" placeholder="brand@email.com" /></div>
          <div class="form-group"><label>Date contacted</label><input class="input" type="date" name="dateContacted" value="${existing?.dateContacted || todayISO()}" /></div>
          <div class="form-group"><label>Status</label><select class="select-input" name="status">${renderOptions(BRAND_STATUSES, existing?.status || 'no_reply')}</select></div>
          <div class="form-group full"><label>Notes</label><textarea class="textarea" name="notes">${escapeHtml(existing?.notes || '')}</textarea></div>
        </div>
        <button type="submit" class="btn btn-primary" style="margin-top:16px;">Save</button>
      </form>
    `,
  });
  bindForm(document.getElementById('brand-form'), (data) => {
    const result = existing ? updateBrandContacted(existing.id, data) : addBrandContacted(data);
    if (result.error) { showToast(result.error, 'error'); return; }
    closeModal();
    showToast(existing ? 'Brand updated' : 'Brand added');
    nav('/brands-contacted');
  });
}

function openBulkImport(type) {
  openModal({
    title: `Bulk Import ${type === 'creators' ? 'Creators' : 'Brands'}`,
    size: 'modal-lg',
    body: `
      <p style="color:var(--text-muted);margin-bottom:12px;font-size:14px;">
        Paste one entry per line. ${type === 'creators' ? 'Format: name, email, channel link, niche, avg views (optional)' : 'Format: name, email'}
      </p>
      <form id="bulk-form">
        <textarea class="textarea" name="lines" style="min-height:200px;font-family:var(--mono);font-size:13px;" placeholder="${type === 'creators' ? 'MrBeast, business@mrbeast.com, https://youtube.com/@mrbeast, Entertainment, 150000000\nMkbhd, contact@mkbhd.com, https://youtube.com/@mkbhd, Tech, 3500000' : 'NordVPN, partnerships@nordvpn.com\nSkillshare, brand@skillshare.com'}"></textarea>
        <button type="submit" class="btn btn-primary" style="margin-top:16px;">Import</button>
      </form>
    `,
  });
  bindForm(document.getElementById('bulk-form'), (data) => {
    const lines = data.lines.split('\n').map((l) => l.trim()).filter(Boolean);
    const result = type === 'creators' ? bulkImportCreators(lines) : bulkImportBrands(lines);
    closeModal();
    showToast(`Added ${result.added}, skipped ${result.skipped} duplicates`);
    nav(type === 'creators' ? '/creators-contacted' : '/brands-contacted');
  });
}

// --- Signed Creators ---

export function renderSignedCreators() {
  const { signedCreators } = getState();
  return `
    <div class="toolbar" id="filters">
      <input class="search-input" name="q" placeholder="Search name, email..." />
      <button type="button" class="btn btn-primary" data-add-signed>+ Add Signed Creator</button>
    </div>
    <div class="card"><div class="table-wrap"><table>
      <thead><tr><th>Name</th><th>Email</th><th>Platform</th><th>Niche</th><th>Avg Views</th><th>Signed</th><th>Linked</th><th></th></tr></thead>
      <tbody id="signed-creators-tbody">${renderSignedCreatorRows(signedCreators)}</tbody>
    </table></div></div>
  `;
}

function renderSignedCreatorRows(list) {
  if (!list.length) return `<tr><td colspan="8">${renderEmpty('No signed creators yet')}</td></tr>`;
  return list.map((c) => {
    const hasConflict = getState().externalLinks.some(
      (l) => l.signedCreatorId === c.id || l.creatorName.toLowerCase() === c.name.toLowerCase(),
    );
    return `
      <tr class="row-clickable" data-go-creator="${c.id}">
        <td><strong>${escapeHtml(c.name)}</strong> ${hasConflict ? '<span class="badge badge-warning" title="Has brand relationships">🔗</span>' : ''}</td>
        <td>${c.contactEmail ? `<a class="link" href="mailto:${escapeHtml(c.contactEmail)}">${escapeHtml(c.contactEmail)}</a>` : '—'}</td>
        <td>${escapeHtml(c.platform || '—')}</td>
        <td>${escapeHtml(c.niche || '—')}</td>
        <td>${formatViews(c.avgViews)}</td>
        <td>${formatDate(c.signedDate)}</td>
        <td>${c.contactedCreatorId ? '<span class="badge badge-accent">From Contacts</span>' : '<span class="badge badge-default">New</span>'}</td>
        <td class="actions-cell" onclick="event.stopPropagation()">
          <button type="button" class="btn btn-danger btn-sm" data-del-signed-creator="${c.id}">🗑</button>
        </td>
      </tr>
    `;
  }).join('');
}

export function bindSignedCreators(root) {
  const filters = root.querySelector('#filters');
  const tbody = root.querySelector('#signed-creators-tbody');

  const refresh = () => {
    const q = filters.querySelector('[name="q"]').value.toLowerCase();
    const list = getState().signedCreators.filter((c) =>
      matchesSearch(q, c.name, c.contactEmail, c.niche, c.platform, c.channelLink),
    );
    tbody.innerHTML = renderSignedCreatorRows(list);
    bindSignedCreatorActions(root);
  };

  filters.querySelector('[name="q"]').addEventListener('input', refresh);
  root.querySelector('[data-add-signed]').addEventListener('click', () => openSignedCreatorChoice());
  bindSignedCreatorActions(root);
}

function bindSignedCreatorActions(root) {
  root.querySelectorAll('[data-go-creator]').forEach((row) => {
    row.addEventListener('click', () => nav(`/creator/${row.dataset.goCreator}`));
  });
  root.querySelectorAll('[data-del-signed-creator]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      confirmDialog('Delete signed creator?', 'This cannot be undone.', () => {
        deleteSignedCreator(btn.dataset.delSignedCreator);
        showToast('Signed creator deleted');
        nav('/signed-creators');
      });
    });
  });
}

function openSignedCreatorChoice() {
  openModal({
    title: 'Add Signed Creator',
    body: `
      <p style="color:var(--text-muted);margin-bottom:16px;">Is this creator already in your Contacts?</p>
      <div class="choice-grid">
        <button type="button" class="choice-card" data-pick-contacts>
          <h4>📋 Pick from Contacts</h4>
          <p>Select a creator you've already contacted. Info pre-fills automatically.</p>
        </button>
        <button type="button" class="choice-card" data-add-new>
          <h4>✨ Add New</h4>
          <p>For creators you signed without contacting them first.</p>
        </button>
      </div>
    `,
  });
  const root = document.getElementById('modal-root');
  root.querySelector('[data-pick-contacts]').addEventListener('click', () => {
    closeModal();
    openPromoteCreatorForm();
  });
  root.querySelector('[data-add-new]').addEventListener('click', () => {
    closeModal();
    openSignedCreatorForm();
  });
}

function openPromoteCreatorForm() {
  const available = getState().creatorsContacted.filter(
    (c) => c.status !== 'signed' && !getState().signedCreators.some((s) => s.contactedCreatorId === c.id),
  );
  if (!available.length) {
    showToast('No eligible contacted creators to promote', 'error');
    return;
  }
  openModal({
    title: 'Promote from Contacts',
    body: `
      <form id="promote-form">
        <div class="form-group">
          <label>Select creator *</label>
          <select class="select-input" name="contactedId" required>
            <option value="">Choose...</option>
            ${available.map((c) => `<option value="${c.id}">${escapeHtml(c.name)}${c.contactEmail ? ` — ${escapeHtml(c.contactEmail)}` : ''}${c.niche ? ` (${escapeHtml(c.niche)})` : ''}</option>`).join('')}
          </select>
        </div>
        <div class="form-group"><label>Platform</label><select class="select-input" name="platform">${renderOptions(PLATFORMS, 'YouTube')}</select></div>
        <div class="form-group"><label>Signed date</label><input class="input" type="date" name="signedDate" value="${todayISO()}" /></div>
        <div class="form-group full"><label>Notes</label><textarea class="textarea" name="notes"></textarea></div>
        <button type="submit" class="btn btn-primary" style="margin-top:16px;">Promote to Signed</button>
      </form>
    `,
  });
  bindForm(document.getElementById('promote-form'), (data) => {
    const result = promoteToSignedCreator(data.contactedId, data);
    if (result.error) { showToast(result.error, 'error'); return; }
    closeModal();
    showToast(`${result.item.name} is now signed!`);
    nav('/signed-creators');
  });
}

function openSignedCreatorForm(existing) {
  openModal({
    title: existing ? 'Edit Signed Creator' : 'Add New Signed Creator',
    body: `
      <form id="signed-creator-form">
        <div class="form-grid">
          <div class="form-group"><label>Name *</label><input class="input" name="name" required value="${escapeHtml(existing?.name || '')}" /></div>
          <div class="form-group"><label>Email</label><input class="input" type="email" name="contactEmail" value="${escapeHtml(existing?.contactEmail || '')}" placeholder="creator@email.com" /></div>
          <div class="form-group"><label>Platform</label><select class="select-input" name="platform">${renderOptions(PLATFORMS, existing?.platform || 'YouTube')}</select></div>
          <div class="form-group"><label>Niche</label><input class="input" name="niche" value="${escapeHtml(existing?.niche || '')}" /></div>
          <div class="form-group"><label>Avg views <span style="font-weight:400;color:var(--text-dim)">(optional)</span></label><input class="input" type="number" name="avgViews" min="0" step="1" value="${existing?.avgViews ?? ''}" placeholder="e.g. 500000" /></div>
          <div class="form-group"><label>Signed date</label><input class="input" type="date" name="signedDate" value="${existing?.signedDate || todayISO()}" /></div>
          <div class="form-group full"><label>Channel link</label><input class="input" name="channelLink" value="${escapeHtml(existing?.channelLink || '')}" /></div>
          <div class="form-group full"><label>Notes</label><textarea class="textarea" name="notes">${escapeHtml(existing?.notes || '')}</textarea></div>
        </div>
        <button type="submit" class="btn btn-primary" style="margin-top:16px;">Save</button>
      </form>
    `,
  });
  bindForm(document.getElementById('signed-creator-form'), (data) => {
    const result = existing ? updateSignedCreator(existing.id, data) : addSignedCreator(data);
    if (result.error) { showToast(result.error, 'error'); return; }
    closeModal();
    showToast(existing ? 'Updated' : 'Signed creator added');
    nav(existing ? `/creator/${existing.id}` : '/signed-creators');
  });
}

// --- Signed Brands ---

export function renderSignedBrands() {
  const { signedBrands } = getState();
  return `
    <div class="toolbar" id="filters">
      <input class="search-input" name="q" placeholder="Search signed brands..." />
      <button type="button" class="btn btn-primary" data-add-signed-brand>+ Add Signed Brand</button>
    </div>
    <div class="card"><div class="table-wrap"><table>
      <thead><tr><th>Brand</th><th>Email</th><th>Signed</th><th>External Creators</th><th>Campaigns</th><th></th></tr></thead>
      <tbody id="signed-brands-tbody">${renderSignedBrandRows(signedBrands)}</tbody>
    </table></div></div>
  `;
}

function renderSignedBrandRows(list) {
  if (!list.length) return `<tr><td colspan="6">${renderEmpty('No signed brands yet')}</td></tr>`;
  return list.map((b) => {
    const extCount = getExternalLinksForBrand(b.id).length;
    const campCount = getCampaignsForBrand(b.id).length;
    return `
      <tr class="row-clickable" data-go-brand="${b.id}">
        <td><strong>${escapeHtml(b.name)}</strong></td>
        <td>${b.contactEmail ? `<a class="link" href="mailto:${escapeHtml(b.contactEmail)}">${escapeHtml(b.contactEmail)}</a>` : '—'}</td>
        <td>${formatDate(b.signedDate)}</td>
        <td><span class="badge badge-warning">${extCount}</span></td>
        <td><span class="badge badge-accent">${campCount}</span></td>
        <td class="actions-cell" onclick="event.stopPropagation()">
          <button type="button" class="btn btn-danger btn-sm" data-del-signed-brand="${b.id}">🗑</button>
        </td>
      </tr>
    `;
  }).join('');
}

export function bindSignedBrands(root) {
  const filters = root.querySelector('#filters');
  const tbody = root.querySelector('#signed-brands-tbody');
  const refresh = () => {
    const q = filters.querySelector('[name="q"]').value.toLowerCase();
    const list = getState().signedBrands.filter((b) => matchesSearch(q, b.name, b.contactEmail));
    tbody.innerHTML = renderSignedBrandRows(list);
    bindSignedBrandActions(root);
  };
  filters.querySelector('[name="q"]').addEventListener('input', refresh);
  root.querySelector('[data-add-signed-brand]').addEventListener('click', () => openSignedBrandChoice());
  bindSignedBrandActions(root);
}

function bindSignedBrandActions(root) {
  root.querySelectorAll('[data-go-brand]').forEach((row) => {
    row.addEventListener('click', () => nav(`/brand/${row.dataset.goBrand}`));
  });
  root.querySelectorAll('[data-del-signed-brand]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      confirmDialog('Delete signed brand?', 'This will also remove their external links and campaigns.', () => {
        deleteSignedBrand(btn.dataset.delSignedBrand);
        showToast('Signed brand deleted');
        nav('/signed-brands');
      });
    });
  });
}

function openSignedBrandChoice() {
  openModal({
    title: 'Add Signed Brand',
    body: `
      <p style="color:var(--text-muted);margin-bottom:16px;">Is this brand already in your Contacts?</p>
      <div class="choice-grid">
        <button type="button" class="choice-card" data-pick-contacts>
          <h4>📋 Pick from Contacts</h4>
          <p>Select a brand you've already contacted.</p>
        </button>
        <button type="button" class="choice-card" data-add-new>
          <h4>✨ Add New</h4>
          <p>For brands you signed without contacting first.</p>
        </button>
      </div>
    `,
  });
  const root = document.getElementById('modal-root');
  root.querySelector('[data-pick-contacts]').addEventListener('click', () => {
    closeModal();
    openPromoteBrandForm();
  });
  root.querySelector('[data-add-new]').addEventListener('click', () => {
    closeModal();
    openSignedBrandForm();
  });
}

function openPromoteBrandForm() {
  const available = getState().brandsContacted.filter(
    (b) => b.status !== 'signed' && !getState().signedBrands.some((s) => s.contactedBrandId === b.id),
  );
  if (!available.length) {
    showToast('No eligible contacted brands to promote', 'error');
    return;
  }
  openModal({
    title: 'Promote Brand from Contacts',
    body: `
      <form id="promote-brand-form">
        <div class="form-group">
          <label>Select brand *</label>
          <select class="select-input" name="contactedId" required>
            <option value="">Choose...</option>
            ${available.map((b) => `<option value="${b.id}">${escapeHtml(b.name)}</option>`).join('')}
          </select>
        </div>
        <div class="form-group"><label>Signed date</label><input class="input" type="date" name="signedDate" value="${todayISO()}" /></div>
        <button type="submit" class="btn btn-primary" style="margin-top:16px;">Promote to Signed</button>
      </form>
    `,
  });
  bindForm(document.getElementById('promote-brand-form'), (data) => {
    const result = promoteToSignedBrand(data.contactedId, data);
    if (result.error) { showToast(result.error, 'error'); return; }
    closeModal();
    showToast(`${result.item.name} is now signed!`);
    nav('/signed-brands');
  });
}

function openSignedBrandForm(existing) {
  openModal({
    title: existing ? 'Edit Signed Brand' : 'Add New Signed Brand',
    body: `
      <form id="signed-brand-form">
        <div class="form-grid">
          <div class="form-group"><label>Brand name *</label><input class="input" name="name" required value="${escapeHtml(existing?.name || '')}" /></div>
          <div class="form-group"><label>Email</label><input class="input" type="email" name="contactEmail" value="${escapeHtml(existing?.contactEmail || '')}" placeholder="brand@email.com" /></div>
          <div class="form-group"><label>Signed date</label><input class="input" type="date" name="signedDate" value="${existing?.signedDate || todayISO()}" /></div>
          <div class="form-group full"><label>Notes</label><textarea class="textarea" name="notes">${escapeHtml(existing?.notes || '')}</textarea></div>
        </div>
        <button type="submit" class="btn btn-primary" style="margin-top:16px;">Save</button>
      </form>
    `,
  });
  bindForm(document.getElementById('signed-brand-form'), (data) => {
    const result = existing ? updateSignedBrand(existing.id, data) : addSignedBrand(data);
    if (result.error) { showToast(result.error, 'error'); return; }
    closeModal();
    showToast(existing ? 'Updated' : 'Signed brand added');
    nav(existing ? `/brand/${existing.id}` : '/signed-brands');
  });
}

// --- Campaigns ---

export function renderCampaigns() {
  const { campaigns, signedBrands, signedCreators } = getState();
  return `
    <div class="toolbar" id="filters">
      <input class="search-input" name="q" placeholder="Search campaigns..." />
      <select class="select-input" name="status" style="width:auto;">
        <option value="">All statuses</option>
        ${renderOptions(CAMPAIGN_STATUSES)}
      </select>
      <button type="button" class="btn btn-primary" data-add-campaign>+ Create Campaign</button>
    </div>
    <div class="card"><div class="table-wrap"><table>
      <thead><tr><th>Campaign</th><th>Brand</th><th>Creators</th><th>Payment</th><th>Agency Cut</th><th>Status</th><th></th></tr></thead>
      <tbody id="campaigns-tbody">${renderCampaignRows(campaigns, signedBrands, signedCreators)}</tbody>
    </table></div></div>
  `;
}

function renderCampaignRows(list, brands, creators) {
  if (!list.length) return `<tr><td colspan="7">${renderEmpty('No campaigns yet')}</td></tr>`;
  return list.map((c) => {
    const brand = brands.find((b) => b.id === c.brandId);
    const creatorNames = c.creatorIds.map((id) => creators.find((cr) => cr.id === id)?.name || '?').join(', ');
    const agencyCut = formatMoney((c.agreedPayment || 0) * (c.agencyPercent || 0) / 100);
    return `
      <tr class="row-clickable" data-go-campaign="${c.id}">
        <td><strong>${escapeHtml(c.name)}</strong><br><span style="font-size:12px;color:var(--text-muted)">${escapeHtml(c.platform || '')}</span></td>
        <td>${escapeHtml(brand?.name || '—')}</td>
        <td>${escapeHtml(creatorNames || '—')}</td>
        <td class="revenue-highlight">${formatMoney(c.agreedPayment)}</td>
        <td>${agencyCut} (${c.agencyPercent || 0}%)</td>
        <td>${statusBadge(c.status, CAMPAIGN_STATUSES)}</td>
        <td class="actions-cell" onclick="event.stopPropagation()">
          <button type="button" class="btn btn-danger btn-sm" data-del-campaign="${c.id}" title="Delete campaign">🗑</button>
        </td>
      </tr>
    `;
  }).join('');
}

export function bindCampaigns(root) {
  const filters = root.querySelector('#filters');
  const tbody = root.querySelector('#campaigns-tbody');
  const refresh = () => {
    const q = filters.querySelector('[name="q"]').value.toLowerCase();
    const status = filters.querySelector('[name="status"]').value;
    const { campaigns, signedBrands, signedCreators } = getState();
    const list = campaigns.filter((c) => {
      const brand = signedBrands.find((b) => b.id === c.brandId);
      const names = c.creatorIds.map((id) => signedCreators.find((cr) => cr.id === id)?.name).join(' ');
      return matchesSearch(q, c.name, brand?.name, names, c.notes) && (!status || c.status === status);
    });
    tbody.innerHTML = renderCampaignRows(list, signedBrands, signedCreators);
    bindCampaignActions(root);
  };
  filters.querySelectorAll('input, select').forEach((el) => el.addEventListener('input', refresh));
  root.querySelector('[data-add-campaign]').addEventListener('click', () => openCampaignForm());
  bindCampaignActions(root);
}

function bindCampaignActions(root) {
  root.querySelectorAll('[data-go-campaign]').forEach((row) => {
    row.addEventListener('click', () => openCampaignForm(getCampaign(row.dataset.goCampaign)));
  });
  root.querySelectorAll('[data-del-campaign]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      confirmDialog('Delete campaign?', 'Are you sure you want to delete this campaign? This cannot be undone.', () => {
        deleteCampaign(btn.dataset.delCampaign);
        showToast('Campaign deleted');
        nav('/campaigns');
      });
    });
  });
}

function openCampaignForm(existing) {
  const { signedBrands, signedCreators } = getState();
  if (!signedBrands.length || !signedCreators.length) {
    showToast('Add signed brands and creators first', 'error');
    return;
  }

  openModal({
    title: existing ? 'Edit Campaign' : 'Create Campaign',
    size: 'modal-lg',
    body: `
      <form id="campaign-form">
        <div class="form-grid">
          <div class="form-group full"><label>Campaign name *</label><input class="input" name="name" required value="${escapeHtml(existing?.name || '')}" /></div>
          <div class="form-group"><label>Brand *</label>
            <select class="select-input" name="brandId" required>
              ${renderOptions(signedBrands.map((b) => ({ value: b.id, label: b.name })), existing?.brandId)}
            </select>
          </div>
          <div class="form-group"><label>Platform</label><select class="select-input" name="platform">${renderOptions(PLATFORMS, existing?.platform || 'YouTube')}</select></div>
          <div class="form-group full"><label>Assigned creators *</label>
            <div class="pill-group" style="gap:10px;">
              ${signedCreators.map((c) => `
                <label style="display:flex;align-items:center;gap:6px;font-weight:400;cursor:pointer;">
                  <input type="checkbox" name="creatorIds" value="${c.id}" ${existing?.creatorIds?.includes(c.id) ? 'checked' : ''} />
                  ${escapeHtml(c.name)}
                </label>
              `).join('')}
            </div>
          </div>
          <div class="form-group full"><label>Deliverables</label><textarea class="textarea" name="deliverables">${escapeHtml(existing?.deliverables || '')}</textarea></div>
          <div class="form-group"><label>Agreed payment ($)</label><input class="input" type="number" name="agreedPayment" min="0" step="1" value="${existing?.agreedPayment ?? ''}" /></div>
          <div class="form-group"><label>Agency %</label><input class="input" type="number" name="agencyPercent" min="0" max="100" step="1" value="${existing?.agencyPercent ?? 20}" /></div>
          <div class="form-group"><label>Creator payout ($)</label><input class="input" type="number" name="creatorPayout" min="0" step="1" value="${existing?.creatorPayout ?? ''}" placeholder="Auto-calculated if empty" /></div>
          <div class="form-group"><label>Status</label><select class="select-input" name="status">${renderOptions(CAMPAIGN_STATUSES, existing?.status || 'negotiating')}</select></div>
          <div class="form-group"><label>Start date</label><input class="input" type="date" name="startDate" value="${existing?.startDate || ''}" /></div>
          <div class="form-group"><label>Due date</label><input class="input" type="date" name="dueDate" value="${existing?.dueDate || ''}" /></div>
          <div class="form-group full"><label>Notes</label><textarea class="textarea" name="notes">${escapeHtml(existing?.notes || '')}</textarea></div>
        </div>
        <div id="conflict-warning"></div>
        <button type="submit" class="btn btn-primary" style="margin-top:16px;">${existing ? 'Save Changes' : 'Create Campaign'}</button>
      </form>
    `,
  });

  const form = document.getElementById('campaign-form');
  const warnEl = document.getElementById('conflict-warning');

  const checkConflicts = () => {
    const fd = new FormData(form);
    const brandId = fd.get('brandId');
    const creatorIds = fd.getAll('creatorIds');
    const conflicts = getConflictForCampaign(brandId, creatorIds);
    if (conflicts.length) {
      warnEl.innerHTML = `<div class="alert alert-danger" style="margin-top:16px;">
        ⚠️ <strong>Conflict detected!</strong> These creators already have a relationship with this brand:
        ${conflicts.map(({ creator, link }) => `<br>• <strong>${escapeHtml(creator.name)}</strong> (${labelFor(RELATIONSHIP_TYPES, link.relationshipType)})`).join('')}
      </div>`;
    } else {
      warnEl.innerHTML = '';
    }
  };

  form.querySelector('[name="brandId"]').addEventListener('change', checkConflicts);
  form.querySelectorAll('[name="creatorIds"]').forEach((cb) => cb.addEventListener('change', checkConflicts));

  bindForm(form, (data) => {
    if (!data.creatorIds?.length) {
      showToast('Select at least one creator', 'error');
      return;
    }
    const payload = { ...data, creatorIds: Array.isArray(data.creatorIds) ? data.creatorIds : [data.creatorIds] };
    if (existing) {
      updateCampaign(existing.id, payload);
      closeModal();
      showToast('Campaign updated');
      nav('/campaigns');
      return;
    }
    const result = addCampaign(payload);
    if (result.conflicts) {
      openModal({
        title: '⚠️ Relationship Conflict',
        body: `
          <div class="alert alert-danger">This creator already has a relationship with this brand. Creating a campaign may mean pitching them to a brand they already work with.</div>
          <ul style="margin:12px 0 16px 20px;color:var(--text-muted);">
            ${result.conflicts.map(({ creator, link }) => `<li><strong>${escapeHtml(creator.name)}</strong> — ${labelFor(RELATIONSHIP_TYPES, link.relationshipType)}</li>`).join('')}
          </ul>
          <p>Do you want to create this campaign anyway?</p>
        `,
        footer: `
          <button type="button" class="btn btn-secondary" data-cancel>Cancel</button>
          <button type="button" class="btn btn-danger" data-force>Create Anyway</button>
        `,
      });
      const mroot = document.getElementById('modal-root');
      mroot.querySelector('[data-cancel]').addEventListener('click', () => {
        closeModal();
        openCampaignForm();
      });
      mroot.querySelector('[data-force]').addEventListener('click', () => {
        addCampaign(payload, true);
        closeModal();
        showToast('Campaign created (conflict overridden)');
        nav('/campaigns');
      });
      return;
    }
    closeModal();
    showToast('Campaign created');
    nav('/campaigns');
  });
}

// --- Brand Detail ---

export function renderBrandDetail(id) {
  const brand = getSignedBrand(id);
  if (!brand) return renderEmpty('Brand not found', '❌');

  const links = getExternalLinksForBrand(id);
  const external = links.filter((l) => l.relationshipType !== 'agency');
  const agency = links.filter((l) => l.relationshipType === 'agency');
  const campaigns = getCampaignsForBrand(id);
  const safe = getCreatorsSafeToPitch(id);
  const { signedCreators } = getState();

  const myCreatorsOnBrand = signedCreators.filter((c) =>
    campaigns.some((camp) => camp.creatorIds.includes(c.id)),
  );

  return `
    <button type="button" class="back-link" data-go="/signed-brands">← Back to Signed Brands</button>
    <div class="detail-header">
      <div>
        <h2>${escapeHtml(brand.name)}</h2>
        <p class="subtitle">${brand.contactEmail ? `<a class="link" href="mailto:${escapeHtml(brand.contactEmail)}">${escapeHtml(brand.contactEmail)}</a> · ` : ''}Signed ${formatDate(brand.signedDate)}</p>
      </div>
      <div style="display:flex;gap:8px;">
        <button type="button" class="btn btn-secondary" data-edit-brand>Edit</button>
        <button type="button" class="btn btn-primary" data-add-link>+ Add External Creator</button>
      </div>
    </div>

    <div class="grid-stats" style="margin-bottom:24px;">
      <div class="stat-card"><div class="stat-label">External Creators</div><div class="stat-value">${external.length}</div></div>
      <div class="stat-card"><div class="stat-label">My Agency Creators</div><div class="stat-value">${myCreatorsOnBrand.length}</div></div>
      <div class="stat-card"><div class="stat-label">Safe to Pitch</div><div class="stat-value">${safe.length}</div></div>
      <div class="stat-card"><div class="stat-label">Campaigns</div><div class="stat-value">${campaigns.length}</div></div>
    </div>

    <div class="section-title">Creators This Brand Already Works With (External)</div>
    <div class="creator-list" style="margin-bottom:24px;">
      ${external.length ? external.map((l) => renderLinkItem(l, brand)).join('') : renderEmpty('No external creators logged yet')}
    </div>

    <div class="section-title">My Agency Creators Connected</div>
    <div class="creator-list" style="margin-bottom:24px;">
      ${myCreatorsOnBrand.length ? myCreatorsOnBrand.map((c) => `
        <div class="creator-item">
          <div class="creator-item-info">
            <div class="creator-item-name">${escapeHtml(c.name)} <span class="badge badge-success">Agency</span></div>
            <div class="creator-item-meta">${escapeHtml(c.platform || '')} · ${getCampaignsForCreator(c.id).filter((camp) => camp.brandId === id).length} campaigns</div>
          </div>
          <button type="button" class="btn btn-ghost btn-sm" data-go-creator="${c.id}">View</button>
        </div>
      `).join('') : renderEmpty('No agency creators on campaigns with this brand yet')}
    </div>

    <div class="section-title">Creators Safe to Pitch</div>
    <div class="creator-list" style="margin-bottom:24px;">
      ${safe.length ? safe.map((c) => `
        <div class="creator-item">
          <div class="creator-item-info">
            <div class="creator-item-name">${escapeHtml(c.name)}</div>
            <div class="creator-item-meta">${escapeHtml(c.niche || '')} · ${escapeHtml(c.platform || '')}</div>
          </div>
          <span class="badge badge-success">Safe</span>
        </div>
      `).join('') : renderEmpty('All signed creators have external conflicts with this brand')}
    </div>

    <div class="section-title">Campaigns with This Brand</div>
    <div class="card"><div class="table-wrap"><table>
      <thead><tr><th>Campaign</th><th>Creators</th><th>Payment</th><th>Status</th></tr></thead>
      <tbody>
        ${campaigns.length ? campaigns.map((c) => {
          const names = c.creatorIds.map((cid) => signedCreators.find((cr) => cr.id === cid)?.name).join(', ');
          return `<tr class="row-clickable" data-go-campaign="${c.id}"><td>${escapeHtml(c.name)}</td><td>${escapeHtml(names)}</td><td>${formatMoney(c.agreedPayment)}</td><td>${statusBadge(c.status, CAMPAIGN_STATUSES)}</td></tr>`;
        }).join('') : `<tr><td colspan="4">${renderEmpty('No campaigns')}</td></tr>`}
      </tbody>
    </table></div></div>
  `;
}

function renderLinkItem(link, brand) {
  const signed = link.signedCreatorId ? getSignedCreator(link.signedCreatorId) : null;
  return `
    <div class="creator-item">
      <div class="creator-item-info">
        <div class="creator-item-name">
          ${escapeHtml(link.creatorName)}
          <span class="badge badge-warning">${labelFor(RELATIONSHIP_TYPES, link.relationshipType)}</span>
          ${signed ? '<span class="badge badge-accent">Now Signed</span>' : ''}
        </div>
        <div class="creator-item-meta">
          ${escapeHtml(link.platform)} 
          ${link.videoLink ? `· <a class="link" href="${escapeHtml(link.videoLink)}" target="_blank" rel="noopener">Video ↗</a>` : ''}
          ${link.notes ? `· ${escapeHtml(link.notes)}` : ''}
        </div>
      </div>
      <button type="button" class="btn btn-danger btn-sm" data-del-link="${link.id}">🗑</button>
    </div>
  `;
}

export function bindBrandDetail(root, id) {
  root.querySelector('.back-link')?.addEventListener('click', () => nav('/signed-brands'));
  root.querySelector('[data-edit-brand]')?.addEventListener('click', () => {
    openSignedBrandForm(getSignedBrand(id));
  });
  root.querySelector('[data-add-link]')?.addEventListener('click', () => {
    openModal({
      title: 'Add External Creator',
      body: `
        <form id="link-form">
          <input type="hidden" name="brandId" value="${id}" />
          <div class="form-grid">
            <div class="form-group"><label>Creator name *</label><input class="input" name="creatorName" required /></div>
            <div class="form-group"><label>Platform</label><select class="select-input" name="platform">${renderOptions(PLATFORMS, 'YouTube')}</select></div>
            <div class="form-group"><label>Relationship</label><select class="select-input" name="relationshipType">${renderOptions(RELATIONSHIP_TYPES, 'external')}</select></div>
            <div class="form-group full"><label>Video link</label><input class="input" name="videoLink" /></div>
            <div class="form-group full"><label>Notes</label><textarea class="textarea" name="notes"></textarea></div>
          </div>
          <button type="submit" class="btn btn-primary" style="margin-top:16px;">Add</button>
        </form>
      `,
    });
    bindForm(document.getElementById('link-form'), (data) => {
      const result = addExternalLink(data);
      if (result.error) { showToast(result.error, 'error'); return; }
      closeModal();
      showToast('External creator added');
      nav(`/brand/${id}`);
    });
  });
  root.querySelectorAll('[data-del-link]').forEach((btn) => {
    btn.addEventListener('click', () => {
      deleteExternalLink(btn.dataset.delLink);
      showToast('Link removed');
      nav(`/brand/${id}`);
    });
  });
  root.querySelectorAll('[data-go-creator]').forEach((btn) => {
    btn.addEventListener('click', () => nav(`/creator/${btn.dataset.goCreator}`));
  });
  root.querySelectorAll('[data-go-campaign]').forEach((row) => {
    row.addEventListener('click', () => openCampaignForm(getCampaign(row.dataset.goCampaign)));
  });
}

// --- Creator Detail ---

export function renderCreatorDetail(id) {
  const creator = getSignedCreator(id);
  if (!creator) return renderEmpty('Creator not found', '❌');

  const campaigns = getCampaignsForCreator(id);
  const { signedBrands, externalLinks } = getState();
  const relationships = externalLinks.filter(
    (l) => l.signedCreatorId === id || l.creatorName.toLowerCase() === creator.name.toLowerCase(),
  );

  const totalRevenue = campaigns.filter((c) => c.status === 'completed').reduce((s, c) => s + (c.creatorPayout || 0), 0);
  const activeDeals = campaigns.filter((c) => c.status === 'active').length;

  return `
    <button type="button" class="back-link" data-go="/signed-creators">← Back to Signed Creators</button>
    <div class="detail-header">
      <div>
        <h2>${escapeHtml(creator.name)} ${relationships.length ? '<span class="badge badge-warning" title="Has brand relationships">🔗 Linked to brands</span>' : ''}</h2>
        <p class="subtitle">${escapeHtml(creator.platform || '')} · ${escapeHtml(creator.niche || '')} · Signed ${formatDate(creator.signedDate)}</p>
        ${creator.contactEmail ? `<p class="subtitle"><a class="link" href="mailto:${escapeHtml(creator.contactEmail)}">${escapeHtml(creator.contactEmail)}</a></p>` : ''}
        ${creator.avgViews != null ? `<p class="subtitle">${formatViews(creator.avgViews)}</p>` : ''}
        ${creator.channelLink ? `<a class="link" href="${escapeHtml(creator.channelLink)}" target="_blank" rel="noopener">Channel ↗</a>` : ''}
      </div>
      <button type="button" class="btn btn-secondary" data-edit-creator>Edit</button>
    </div>

    <div class="grid-stats" style="margin-bottom:24px;">
      <div class="stat-card"><div class="stat-label">Total Campaigns</div><div class="stat-value">${campaigns.length}</div></div>
      <div class="stat-card"><div class="stat-label">Active Deals</div><div class="stat-value">${activeDeals}</div></div>
      <div class="stat-card"><div class="stat-label">Completed Payout</div><div class="stat-value revenue-highlight">${formatMoney(totalRevenue)}</div></div>
      <div class="stat-card"><div class="stat-label">Brand Relationships</div><div class="stat-value">${relationships.length}</div></div>
    </div>

    ${relationships.length ? `
      <div class="section-title">Known Brand Relationships</div>
      <div class="creator-list" style="margin-bottom:24px;">
        ${relationships.map((l) => {
          const brand = signedBrands.find((b) => b.id === l.brandId);
          return `
            <div class="creator-item">
              <div class="creator-item-info">
                <div class="creator-item-name">${escapeHtml(brand?.name || '?')} <span class="badge badge-warning">${labelFor(RELATIONSHIP_TYPES, l.relationshipType)}</span></div>
                <div class="creator-item-meta">${l.videoLink ? `<a class="link" href="${escapeHtml(l.videoLink)}" target="_blank">Video ↗</a>` : ''} ${l.notes ? escapeHtml(l.notes) : ''}</div>
              </div>
              <button type="button" class="btn btn-ghost btn-sm" data-go-brand="${l.brandId}">View Brand</button>
            </div>
          `;
        }).join('')}
      </div>
    ` : ''}

    <div class="section-title">Campaigns / Deals</div>
    <div class="card"><div class="table-wrap"><table>
      <thead><tr><th>Campaign</th><th>Brand</th><th>Payment</th><th>Payout</th><th>Status</th></tr></thead>
      <tbody>
        ${campaigns.length ? campaigns.map((c) => {
          const brand = signedBrands.find((b) => b.id === c.brandId);
          return `<tr class="row-clickable" data-go-campaign="${c.id}">
            <td>${escapeHtml(c.name)}</td>
            <td>${escapeHtml(brand?.name || '—')}</td>
            <td>${formatMoney(c.agreedPayment)}</td>
            <td>${formatMoney(c.creatorPayout)}</td>
            <td>${statusBadge(c.status, CAMPAIGN_STATUSES)}</td>
          </tr>`;
        }).join('') : `<tr><td colspan="5">${renderEmpty('No campaigns yet')}</td></tr>`}
      </tbody>
    </table></div></div>
  `;
}

export function bindCreatorDetail(root, id) {
  root.querySelector('.back-link')?.addEventListener('click', () => nav('/signed-creators'));
  root.querySelector('[data-edit-creator]')?.addEventListener('click', () => {
    openSignedCreatorForm(getSignedCreator(id));
  });
  root.querySelectorAll('[data-go-brand]').forEach((btn) => {
    btn.addEventListener('click', () => nav(`/brand/${btn.dataset.goBrand}`));
  });
  root.querySelectorAll('[data-go-campaign]').forEach((row) => {
    row.addEventListener('click', () => openCampaignForm(getCampaign(row.dataset.goCampaign)));
  });
}

// Export for app.js topbar actions
export { openSignedCreatorChoice, openSignedBrandChoice, openCampaignForm, openBulkImport };
