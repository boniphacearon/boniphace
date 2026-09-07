import { api } from './api.js';

export const Projects = {
  projects: [],
  async load() {
    try {
      const data = await api('/api/projects');
      this.projects = data.projects || [];
      this.render();
    } catch (err) {
      console.error('Error loading projects:', err);
    }
  },
  render() {
    const el = document.getElementById('projects-list');
    if (!el) return;
    el.innerHTML = this.projects.map(p => `
      <div class="list-item" data-id="${p.id}">
        <span><span style="color:${p.color}">●</span> ${this.escapeHtml(p.name)}</span>
      </div>
    `).join('') || '<p class="muted">No projects yet</p>';
    el.querySelectorAll('.list-item').forEach(item => {
      item.onclick = () => {
        window.BP.currentProjectId = item.dataset.id;
        el.querySelectorAll('.list-item').forEach(i => i.classList.remove('active'));
        item.classList.add('active');
      };
    });
  },
  async create() {
    const name = prompt('Project name:');
    if (!name) return;
    const description = prompt('Description (optional):') || '';
    try {
      await api('/api/projects', { method: 'POST', body: { name, description } });
      this.load();
    } catch (err) {
      console.error('Error creating project:', err);
      alert('Failed to create project: ' + err.message);
    }
  },
  escapeHtml(s) {
    return String(s || '').replace(/[&<>"']/g, c => 
      ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c])
    );
  }
};
