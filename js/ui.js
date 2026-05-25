import { escapeHtml } from './constants.js';

export function showToast(message, type = 'success') {
  const root = document.getElementById('toast-root');
  const el = document.createElement('div');
  el.className = `toast toast-${type}`;
  el.textContent = message;
  root.appendChild(el);
  setTimeout(() => el.remove(), 3200);
}

export function openModal({ title, body, footer, size = '' }) {
  const root = document.getElementById('modal-root');
  root.innerHTML = `
    <div class="modal-overlay" data-modal-overlay>
      <div class="modal ${size}" role="dialog">
        <div class="modal-header">
          <h3>${escapeHtml(title)}</h3>
          <button type="button" class="btn btn-ghost btn-icon" data-close-modal aria-label="Close">✕</button>
        </div>
        <div class="modal-body">${body}</div>
        ${footer ? `<div class="modal-footer">${footer}</div>` : ''}
      </div>
    </div>
  `;

  const overlay = root.querySelector('[data-modal-overlay]');
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) closeModal();
  });
  root.querySelector('[data-close-modal]')?.addEventListener('click', closeModal);
  return root;
}

export function closeModal() {
  document.getElementById('modal-root').innerHTML = '';
}

export function bindForm(form, onSubmit) {
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const fd = new FormData(form);
    const data = Object.fromEntries(fd.entries());
    // handle multi-select checkboxes named creatorIds
    const creatorIds = fd.getAll('creatorIds');
    if (creatorIds.length) data.creatorIds = creatorIds;
    onSubmit(data);
  });
}

export function renderOptions(list, selected, valueKey = 'value', labelKey = 'label') {
  return list.map((item) => {
    const val = typeof item === 'string' ? item : item[valueKey];
    const label = typeof item === 'string' ? item : item[labelKey];
    const sel = val === selected ? ' selected' : '';
    return `<option value="${escapeHtml(val)}"${sel}>${escapeHtml(label)}</option>`;
  }).join('');
}

export function renderEmpty(message, icon = '📭') {
  return `<div class="empty"><div class="empty-icon">${icon}</div><p>${escapeHtml(message)}</p></div>`;
}

export function renderBadge(status, label) {
  return `<span class="badge badge-${status.replace('_', '-')}">${escapeHtml(label)}</span>`;
}

export function statusBadge(status, labels) {
  const label = labels.find((l) => l.value === status)?.label || status;
  const cls = {
    no_reply: 'default', replied: 'info', negotiating: 'warning', signed: 'success',
    active: 'success', completed: 'accent', cancelled: 'danger', rejected: 'danger',
  }[status] || 'default';
  return `<span class="badge badge-${cls}">${escapeHtml(label)}</span>`;
}

export function confirmDialog(title, message, onConfirm) {
  openModal({
    title,
    body: `<p>${escapeHtml(message)}</p>`,
    footer: `
      <button type="button" class="btn btn-secondary" data-close-cancel>Cancel</button>
      <button type="button" class="btn btn-danger" data-confirm>Delete</button>
    `,
  });
  const root = document.getElementById('modal-root');
  root.querySelector('[data-close-cancel]').addEventListener('click', closeModal);
  root.querySelector('[data-confirm]').addEventListener('click', () => {
    closeModal();
    onConfirm();
  });
}

export function readFilters(container) {
  return {
    q: container.querySelector('[name="q"]')?.value?.toLowerCase() || '',
    status: container.querySelector('[name="status"]')?.value || '',
    niche: container.querySelector('[name="niche"]')?.value?.toLowerCase() || '',
  };
}

export function matchesSearch(q, ...fields) {
  if (!q) return true;
  return fields.some((f) => String(f || '').toLowerCase().includes(q));
}
