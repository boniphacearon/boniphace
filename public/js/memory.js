import { api } from './app.js';

export const Memory = {
  memories: [],
  async load() {
    const data = await api('/api/memories');
    this.memories = data.memories;
    this.render();
  },
  render() {
    const el = document.getElementById('memory-list');
    if (!el) return;
    if (this.memories.length === 0) {
      el.innerHTML = '<p class="muted">No memories yet. Say "remember that..." in chat.</p>';
      return;
    }
    el.innerHTML = this.memories.map(m => `
      <div class="list-item">
        <span>${escapeHtml(m.content)}</span>
        <button class="icon-btn" data-id="${m.id}" style="width:24px;height:24px;font-size:12px;">✕</button>
      </div>
    `).join('');
    el.querySelectorAll('button').forEach(b => {
      b.onclick = async () => {
        await api(`/api/memories/${b.dataset.id}`, { method: 'DELETE' });
        this.load();
      };
    });
  }
};

document.getElementById('memory-toggle')?.addEventListener('change', async (e) => {
  window.BP.settings.memory_enabled = e.target.checked ? 1 : 0;
  await api('/api/settings', { method: 'PUT', body: { memory_enabled: e.target.checked ? 1 : 0 } });
});

document.getElementById('clear-memory-btn')?.addEventListener('click', async () => {
  if (!confirm('Delete ALL memories?')) return;
  await api('/api/memories', { method: 'DELETE' });
  Memory.load();
});

function escapeHtml(s) {
  return String(s || '').replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
}