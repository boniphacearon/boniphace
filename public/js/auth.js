import { api } from './app.js';

export const Auth = {
  async me(token) {
    const res = await fetch('/api/auth/me', { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) throw new Error('Not authenticated');
    return res.json();
  },
  async login(email, password) {
    const res = await api('/api/auth/login', {
      method: 'POST',
      body: { email, password }
    });
    window.BP.token = res.token;
    window.BP.user = res.user;
    localStorage.setItem('bp_token', res.token);
    return res;
  },
  async signup(data) {
    const res = await api('/api/auth/signup', { method: 'POST', body: data });
    window.BP.token = res.token;
    window.BP.user = res.user;
    localStorage.setItem('bp_token', res.token);
    return res;
  }
};

// Wire up forms
document.querySelectorAll('.auth-tabs .tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.auth-tabs .tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.auth-form').forEach(f => f.classList.remove('active'));
    tab.classList.add('active');
    document.getElementById(`${tab.dataset.tab}-form`).classList.add('active');
  });
});

document.getElementById('login-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const errEl = document.getElementById('login-error');
  errEl.textContent = '';
  try {
    await Auth.login(
      document.getElementById('login-email').value,
      document.getElementById('login-password').value
    );
    location.reload();
  } catch (err) {
    errEl.textContent = err.message;
  }
});

document.getElementById('signup-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const errEl = document.getElementById('signup-error');
  errEl.textContent = '';
  try {
    await Auth.signup({
      email: document.getElementById('signup-email').value,
      username: document.getElementById('signup-username').value,
      displayName: document.getElementById('signup-display').value,
      password: document.getElementById('signup-password').value
    });
    location.reload();
  } catch (err) {
    errEl.textContent = err.message;
  }
});