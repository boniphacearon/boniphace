import { api } from './app.js';

export const Settings = {
  async load() {
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
      document.getElementById('account-info').textContent =
        `${window.BP.user.display_name || window.BP.user.username} · ${window.BP.user.email}`;
    }
  },
  async save(patch) {
    await api('/api/settings', { method: 'PUT', body: patch });
  }
};

document.getElementById('save-settings-btn')?.addEventListener('click', async () => {
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

document.getElementById('delete-account-btn')?.addEventListener('click', async () => {
  if (!confirm('This will permanently delete your account and all data. Continue?')) return;
  // Add DELETE /api/auth/account endpoint on server if you want this.
  alert('Account deletion endpoint not yet wired. Contact admin.');
});