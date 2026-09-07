import { api } from './api.js';

export const Memory = {
  memories: [],
  async load() {
    try {
      const data = await api('/api/memories');
      this.memories = data.memories || [];
      this.render();
    } catch (err) {
      console.error('Error loading memories:', err);
    }
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
        <span>${this.escapeHtml(m.content)}</span>
        <button class="icon-btn" data-id="${m.id}" style="width:24px;height:24px;font-size:12px;">✕</button>
      </div>
    `).join('');
    el.querySelectorAll('button').forEach(b => {
      b.onclick = async () => {
        try {
          await api(`/api/memories/${b.dataset.id}`, { method: 'DELETE' });
          this.load();
        } catch (err) {
          console.error('Error deleting memory:', err);
        }
      };
    });
  },
  escapeHtml(s) {
    return String(s || '').replace(/[&<>"']/g, c => 
      ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c])
    );
  }
};

document.addEventListener('DOMContentLoaded', () => {
  const toggle = document.getElementById('memory-toggle');
  if (toggle) {
    toggle.addEventListener('change', async (e) => {
      window.BP.settings.memory_enabled = e.target.checked ? 1 : 0;
      try {
        await api('/api/settings', { method: 'PUT', body: { memory_enabled: e.target.checked ? 1 : 0 } });
      } catch (err) {
        console.error('Error saving setting:', err);
      }
    });
  }

  const clearBtn = document.getElementById('clear-memory-btn');
  if (clearBtn) {
    clearBtn.addEventListener('click', async () => {
      if (!confirm('Delete ALL memories?')) return;
      try {
        await api('/api/memories', { method: 'DELETE' });
        Memory.load();
      } catch (err) {
        console.error('Error clearing memories:', err);
      }
    });
  }
});
