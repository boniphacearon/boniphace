import { api } from './api.js';

export const Settings = {
  async load() {
    try {
      const data = await api('/api/settings');
      const s = data.settings || {};
      window.BP.settings = { ...window.BP.settings, ...s };
      
      const setVal = (id, v) => {
        const el = document.getElementById(id);
        if (!el) return;
        if (el.type === 'checkbox') el.checked = !!v;
        else el.value = v;
      };
      setVal('set-style', s.response_style);
      setVal('set-lang', s.language);
      setVal('set-voice', s.voice_enabled);
      setVal('set-tts', s.tts_enabled);
      setVal('memory-toggle', s.memory_enabled);
      
      if (window.BP.user) {
        const accountInfo = document.getElementById('account-info');
        if (accountInfo) {
          accountInfo.textContent = `${window.BP.user.display_name || window.BP.user.username} · ${window.BP.user.email}`;
        }
      }
    } catch (err) {
      console.error('Error loading settings:', err);
    }
  },
  async save(patch) {
    try {
      await api('/api/settings', { method: 'PUT', body: patch });
    } catch (err) {
      console.error('Error saving settings:', err);
    }
  }
};

document.addEventListener('DOMContentLoaded', () => {
  const saveBtn = document.getElementById('save-settings-btn');
  if (saveBtn) {
    saveBtn.addEventListener('click', async () => {
      const patch = {
        response_style: document.getElementById('set-style').value,
        language: document.getElementById('set-lang').value,
        voice_enabled: document.getElementById('set-voice').checked ? 1 : 0,
        tts_enabled: document.getElementById('set-tts').checked ? 1 : 0
      };
      await Settings.save(patch);
      window.BP.settings = { ...window.BP.settings, ...patch };
      alert('Settings saved');
    });
  }

  const deleteBtn = document.getElementById('delete-account-btn');
  if (deleteBtn) {
    deleteBtn.addEventListener('click', () => {
      alert('Account deletion not yet implemented. Contact admin.');
    });
  }
});
