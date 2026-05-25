import {
  STORAGE_KEY,
  uid,
  normalizeName,
  todayISO,
} from './constants.js';

const emptyState = () => ({
  creatorsContacted: [],
  brandsContacted: [],
  signedCreators: [],
  signedBrands: [],
  externalLinks: [],
  campaigns: [],
  activity: [],
});

let state = load();
const listeners = new Set();

function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return emptyState();
    return { ...emptyState(), ...JSON.parse(raw) };
  } catch {
    return emptyState();
  }
}

function persist() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  listeners.forEach((fn) => fn(state));
}

export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function getState() {
  return state;
}

export function exportData() {
  return JSON.stringify(state, null, 2);
}

export function importData(json) {
  const parsed = JSON.parse(json);
  state = { ...emptyState(), ...parsed };
  persist();
}

export function logActivity(text) {
  state.activity.unshift({
    id: uid(),
    text,
    at: new Date().toISOString(),
  });
  state.activity = state.activity.slice(0, 100);
}

// --- Creators Contacted ---

export function findDuplicateCreator(name, excludeId) {
  const n = normalizeName(name);
  return state.creatorsContacted.find(
    (c) => normalizeName(c.name) === n && c.id !== excludeId,
  );
}

export function addCreatorContacted(data) {
  const dup = findDuplicateCreator(data.name);
  if (dup) return { error: `Creator "${data.name}" already exists in Contacts.` };
  const item = {
    id: uid(),
    name: data.name.trim(),
    channelLink: data.channelLink?.trim() || '',
    niche: data.niche?.trim() || '',
    dateContacted: data.dateContacted || todayISO(),
    status: data.status || 'no_reply',
    notes: data.notes?.trim() || '',
    createdAt: new Date().toISOString(),
  };
  state.creatorsContacted.unshift(item);
  logActivity(`Added contacted creator <strong>${item.name}</strong>`);
  persist();
  return { item };
}

export function updateCreatorContacted(id, data) {
  const idx = state.creatorsContacted.findIndex((c) => c.id === id);
  if (idx === -1) return { error: 'Not found' };
  const dup = findDuplicateCreator(data.name, id);
  if (dup) return { error: `Creator "${data.name}" already exists.` };
  state.creatorsContacted[idx] = { ...state.creatorsContacted[idx], ...data, name: data.name.trim() };
  persist();
  return { item: state.creatorsContacted[idx] };
}

export function deleteCreatorContacted(id) {
  state.creatorsContacted = state.creatorsContacted.filter((c) => c.id !== id);
  persist();
}

export function bulkImportCreators(lines) {
  let added = 0;
  let skipped = 0;
  for (const line of lines) {
    const parts = line.split(/[,;\t|]/).map((p) => p.trim()).filter(Boolean);
    if (!parts.length) continue;
    const [name, channelLink = '', niche = ''] = parts;
    if (findDuplicateCreator(name)) { skipped++; continue; }
    addCreatorContacted({ name, channelLink, niche });
    added++;
  }
  return { added, skipped };
}

// --- Brands Contacted ---

export function findDuplicateBrand(name, excludeId) {
  const n = normalizeName(name);
  return state.brandsContacted.find(
    (b) => normalizeName(b.name) === n && b.id !== excludeId,
  );
}

export function addBrandContacted(data) {
  const dup = findDuplicateBrand(data.name);
  if (dup) return { error: `Brand "${data.name}" already exists in Contacts.` };
  const item = {
    id: uid(),
    name: data.name.trim(),
    contactEmail: data.contactEmail?.trim() || '',
    dateContacted: data.dateContacted || todayISO(),
    status: data.status || 'no_reply',
    notes: data.notes?.trim() || '',
    createdAt: new Date().toISOString(),
  };
  state.brandsContacted.unshift(item);
  logActivity(`Added contacted brand <strong>${item.name}</strong>`);
  persist();
  return { item };
}

export function updateBrandContacted(id, data) {
  const idx = state.brandsContacted.findIndex((b) => b.id === id);
  if (idx === -1) return { error: 'Not found' };
  const dup = findDuplicateBrand(data.name, id);
  if (dup) return { error: `Brand "${data.name}" already exists.` };
  state.brandsContacted[idx] = { ...state.brandsContacted[idx], ...data, name: data.name.trim() };
  persist();
  return { item: state.brandsContacted[idx] };
}

export function deleteBrandContacted(id) {
  state.brandsContacted = state.brandsContacted.filter((b) => b.id !== id);
  persist();
}

export function bulkImportBrands(lines) {
  let added = 0;
  let skipped = 0;
  for (const line of lines) {
    const parts = line.split(/[,;\t|]/).map((p) => p.trim()).filter(Boolean);
    if (!parts.length) continue;
    const [name, contactEmail = ''] = parts;
    if (findDuplicateBrand(name)) { skipped++; continue; }
    addBrandContacted({ name, contactEmail });
    added++;
  }
  return { added, skipped };
}

// --- Signed Creators ---

export function findDuplicateSignedCreator(name, excludeId) {
  const n = normalizeName(name);
  return state.signedCreators.find(
    (c) => normalizeName(c.name) === n && c.id !== excludeId,
  );
}

export function promoteToSignedCreator(contactedId, extra = {}) {
  const contact = state.creatorsContacted.find((c) => c.id === contactedId);
  if (!contact) return { error: 'Contact not found' };
  const existing = state.signedCreators.find((s) => s.contactedCreatorId === contactedId);
  if (existing) return { error: `${contact.name} is already signed.` };
  const dup = findDuplicateSignedCreator(contact.name);
  if (dup) return { error: `Signed creator "${contact.name}" already exists.` };

  const item = {
    id: uid(),
    contactedCreatorId: contactedId,
    name: contact.name,
    channelLink: contact.channelLink,
    niche: contact.niche,
    platform: extra.platform || 'YouTube',
    signedDate: extra.signedDate || todayISO(),
    notes: extra.notes || contact.notes || '',
    createdAt: new Date().toISOString(),
  };
  state.signedCreators.unshift(item);
  contact.status = 'signed';
  autoLinkExternalRecords(item);
  logActivity(`Promoted <strong>${item.name}</strong> to Signed Creators`);
  persist();
  return { item };
}

export function addSignedCreator(data) {
  const dup = findDuplicateSignedCreator(data.name);
  if (dup) return { error: `Signed creator "${data.name}" already exists.` };
  const item = {
    id: uid(),
    contactedCreatorId: data.contactedCreatorId || null,
    name: data.name.trim(),
    channelLink: data.channelLink?.trim() || '',
    niche: data.niche?.trim() || '',
    platform: data.platform || 'YouTube',
    signedDate: data.signedDate || todayISO(),
    notes: data.notes?.trim() || '',
    createdAt: new Date().toISOString(),
  };
  state.signedCreators.unshift(item);
  if (data.contactedCreatorId) {
    const c = state.creatorsContacted.find((x) => x.id === data.contactedCreatorId);
    if (c) c.status = 'signed';
  }
  autoLinkExternalRecords(item);
  logActivity(`Added signed creator <strong>${item.name}</strong>`);
  persist();
  return { item };
}

export function updateSignedCreator(id, data) {
  const idx = state.signedCreators.findIndex((c) => c.id === id);
  if (idx === -1) return { error: 'Not found' };
  const dup = findDuplicateSignedCreator(data.name, id);
  if (dup) return { error: `Signed creator "${data.name}" already exists.` };
  state.signedCreators[idx] = { ...state.signedCreators[idx], ...data, name: data.name.trim() };
  autoLinkExternalRecords(state.signedCreators[idx]);
  persist();
  return { item: state.signedCreators[idx] };
}

export function deleteSignedCreator(id) {
  state.signedCreators = state.signedCreators.filter((c) => c.id !== id);
  state.externalLinks.forEach((l) => {
    if (l.signedCreatorId === id) l.signedCreatorId = null;
  });
  state.campaigns.forEach((c) => {
    c.creatorIds = c.creatorIds.filter((cid) => cid !== id);
  });
  persist();
}

export function getSignedCreator(id) {
  return state.signedCreators.find((c) => c.id === id);
}

// --- Signed Brands ---

export function findDuplicateSignedBrand(name, excludeId) {
  const n = normalizeName(name);
  return state.signedBrands.find(
    (b) => normalizeName(b.name) === n && b.id !== excludeId,
  );
}

export function promoteToSignedBrand(contactedId, extra = {}) {
  const contact = state.brandsContacted.find((b) => b.id === contactedId);
  if (!contact) return { error: 'Contact not found' };
  const existing = state.signedBrands.find((s) => s.contactedBrandId === contactedId);
  if (existing) return { error: `${contact.name} is already signed.` };
  const dup = findDuplicateSignedBrand(contact.name);
  if (dup) return { error: `Signed brand "${contact.name}" already exists.` };

  const item = {
    id: uid(),
    contactedBrandId: contactedId,
    name: contact.name,
    contactEmail: contact.contactEmail,
    signedDate: extra.signedDate || todayISO(),
    notes: extra.notes || contact.notes || '',
    createdAt: new Date().toISOString(),
  };
  state.signedBrands.unshift(item);
  contact.status = 'signed';
  logActivity(`Promoted <strong>${item.name}</strong> to Signed Brands`);
  persist();
  return { item };
}

export function addSignedBrand(data) {
  const dup = findDuplicateSignedBrand(data.name);
  if (dup) return { error: `Signed brand "${data.name}" already exists.` };
  const item = {
    id: uid(),
    contactedBrandId: data.contactedBrandId || null,
    name: data.name.trim(),
    contactEmail: data.contactEmail?.trim() || '',
    signedDate: data.signedDate || todayISO(),
    notes: data.notes?.trim() || '',
    createdAt: new Date().toISOString(),
  };
  state.signedBrands.unshift(item);
  if (data.contactedBrandId) {
    const b = state.brandsContacted.find((x) => x.id === data.contactedBrandId);
    if (b) b.status = 'signed';
  }
  logActivity(`Added signed brand <strong>${item.name}</strong>`);
  persist();
  return { item };
}

export function updateSignedBrand(id, data) {
  const idx = state.signedBrands.findIndex((b) => b.id === id);
  if (idx === -1) return { error: 'Not found' };
  const dup = findDuplicateSignedBrand(data.name, id);
  if (dup) return { error: `Signed brand "${data.name}" already exists.` };
  state.signedBrands[idx] = { ...state.signedBrands[idx], ...data, name: data.name.trim() };
  persist();
  return { item: state.signedBrands[idx] };
}

export function deleteSignedBrand(id) {
  state.signedBrands = state.signedBrands.filter((b) => b.id !== id);
  state.externalLinks = state.externalLinks.filter((l) => l.brandId !== id);
  state.campaigns = state.campaigns.filter((c) => c.brandId !== id);
  persist();
}

export function getSignedBrand(id) {
  return state.signedBrands.find((b) => b.id === id);
}

// --- External Links ---

function autoLinkExternalRecords(signedCreator) {
  state.externalLinks.forEach((link) => {
    if (normalizeName(link.creatorName) === normalizeName(signedCreator.name)) {
      link.signedCreatorId = signedCreator.id;
      if (link.relationshipType !== 'agency') {
        // keep external type unless explicitly agency
      }
    }
  });
}

export function findOrCreateSignedBrandByName(name) {
  const existing = state.signedBrands.find((b) => normalizeName(b.name) === normalizeName(name));
  if (existing) return existing;
  const result = addSignedBrand({ name: name.trim() });
  return result.item;
}

export function addExternalLink(data) {
  const brand = data.brandId
    ? getSignedBrand(data.brandId)
    : findOrCreateSignedBrandByName(data.brandName);
  if (!brand) return { error: 'Brand required' };

  const signedCreator = state.signedCreators.find(
    (c) => normalizeName(c.name) === normalizeName(data.creatorName),
  );

  const existing = state.externalLinks.find(
    (l) => l.brandId === brand.id && normalizeName(l.creatorName) === normalizeName(data.creatorName),
  );
  if (existing) return { error: `Relationship already logged: ${data.creatorName} ↔ ${brand.name}` };

  const item = {
    id: uid(),
    brandId: brand.id,
    creatorName: data.creatorName.trim(),
    platform: data.platform || 'YouTube',
    channelLink: data.channelLink?.trim() || '',
    notes: data.notes?.trim() || '',
    relationshipType: data.relationshipType || 'external',
    videoLink: data.videoLink?.trim() || '',
    signedCreatorId: signedCreator?.id || null,
    createdAt: new Date().toISOString(),
  };
  state.externalLinks.unshift(item);
  logActivity(`Logged sponsorship: <strong>${item.creatorName}</strong> ↔ <strong>${brand.name}</strong>`);
  persist();
  return { item, brand };
}

export function deleteExternalLink(id) {
  state.externalLinks = state.externalLinks.filter((l) => l.id !== id);
  persist();
}

export function getExternalLinksForBrand(brandId) {
  return state.externalLinks.filter((l) => l.brandId === brandId);
}

export function getConflictForCampaign(brandId, creatorIds) {
  const links = getExternalLinksForBrand(brandId);
  const conflicts = [];
  for (const cid of creatorIds) {
    const creator = getSignedCreator(cid);
    if (!creator) continue;
    const link = links.find(
      (l) =>
        l.signedCreatorId === cid ||
        normalizeName(l.creatorName) === normalizeName(creator.name),
    );
    if (link && link.relationshipType !== 'agency') {
      conflicts.push({ creator, link });
    }
  }
  return conflicts;
}

export function getCreatorsSafeToPitch(brandId) {
  const linkedNames = new Set(
    getExternalLinksForBrand(brandId)
      .filter((l) => l.relationshipType !== 'agency')
      .map((l) => normalizeName(l.creatorName)),
  );
  return state.signedCreators.filter((c) => !linkedNames.has(normalizeName(c.name)));
}

// --- Campaigns ---

export function addCampaign(data, force = false) {
  if (!force) {
    const conflicts = getConflictForCampaign(data.brandId, data.creatorIds || []);
    if (conflicts.length) return { conflicts };
  }

  const payment = Number(data.agreedPayment) || 0;
  const pct = Number(data.agencyPercent) || 0;
  const payout = data.creatorPayout != null && data.creatorPayout !== ''
    ? Number(data.creatorPayout)
    : payment * (1 - pct / 100);

  const item = {
    id: uid(),
    name: data.name.trim(),
    brandId: data.brandId,
    creatorIds: data.creatorIds || [],
    platform: data.platform || 'YouTube',
    deliverables: data.deliverables?.trim() || '',
    agreedPayment: payment,
    agencyPercent: pct,
    creatorPayout: payout,
    status: data.status || 'negotiating',
    startDate: data.startDate || '',
    dueDate: data.dueDate || '',
    notes: data.notes?.trim() || '',
    createdAt: new Date().toISOString(),
  };
  state.campaigns.unshift(item);
  const brand = getSignedBrand(item.brandId);
  logActivity(`Created campaign <strong>${item.name}</strong> for ${brand?.name || 'brand'}`);
  persist();
  return { item };
}

export function updateCampaign(id, data) {
  const idx = state.campaigns.findIndex((c) => c.id === id);
  if (idx === -1) return { error: 'Not found' };
  const payment = Number(data.agreedPayment) ?? state.campaigns[idx].agreedPayment;
  const pct = Number(data.agencyPercent) ?? state.campaigns[idx].agencyPercent;
  const payout = data.creatorPayout != null && data.creatorPayout !== ''
    ? Number(data.creatorPayout)
    : payment * (1 - pct / 100);

  state.campaigns[idx] = {
    ...state.campaigns[idx],
    ...data,
    agreedPayment: payment,
    agencyPercent: pct,
    creatorPayout: payout,
    name: data.name?.trim() || state.campaigns[idx].name,
  };
  persist();
  return { item: state.campaigns[idx] };
}

export function deleteCampaign(id) {
  state.campaigns = state.campaigns.filter((c) => c.id !== id);
  persist();
}

export function getCampaign(id) {
  return state.campaigns.find((c) => c.id === id);
}

export function getCampaignsForBrand(brandId) {
  return state.campaigns.filter((c) => c.brandId === brandId);
}

export function getCampaignsForCreator(creatorId) {
  return state.campaigns.filter((c) => c.creatorIds.includes(creatorId));
}

// --- Stats ---

export function getStats() {
  const activeCampaigns = state.campaigns.filter((c) => c.status === 'active');
  const completedRevenue = state.campaigns
    .filter((c) => c.status === 'completed')
    .reduce((sum, c) => sum + (c.agreedPayment || 0), 0);
  const activeRevenue = activeCampaigns.reduce((sum, c) => sum + (c.agreedPayment || 0), 0);
  const agencyRevenue = state.campaigns
    .filter((c) => ['active', 'completed'].includes(c.status))
    .reduce((sum, c) => sum + ((c.agreedPayment || 0) * (c.agencyPercent || 0) / 100), 0);

  return {
    creatorsContacted: state.creatorsContacted.length,
    brandsContacted: state.brandsContacted.length,
    signedCreators: state.signedCreators.length,
    signedBrands: state.signedBrands.length,
    activeCampaigns: activeCampaigns.length,
    totalCampaigns: state.campaigns.length,
    activeRevenue,
    completedRevenue,
    agencyRevenue,
  };
}

export function findSignedBrandByName(name) {
  return state.signedBrands.find((b) => normalizeName(b.name) === normalizeName(name));
}

export function findSignedCreatorByName(name) {
  return state.signedCreators.find((c) => normalizeName(c.name) === normalizeName(name));
}
