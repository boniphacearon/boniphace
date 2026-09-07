// Auth module

export const Auth = {
  async me(token) {
    const res = await fetch('/api/auth/me', { 
      headers: { Authorization: `Bearer ${token}` } 
    });
    if (!res.ok) throw new Error('Not authenticated');
    return res.json();
  },
  
  async login(email, password) {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Login failed');
    
    window.BP.token = data.token;
    window.BP.user = data.user;
    localStorage.setItem('bp_token', data.token);
    return data;
  },
  
  async signup(data) {
    const res = await fetch('/api/auth/signup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    const result = await res.json();
    if (!res.ok) throw new Error(result.error || 'Signup failed');
    
    window.BP.token = result.token;
    window.BP.user = result.user;
    localStorage.setItem('bp_token', result.token);
    return result;
  }
};

// Setup function to connect buttons
function setupAuth() {
  // Tab switching
  document.querySelectorAll('.auth-tabs .tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.auth-tabs .tab').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.auth-form').forEach(f => f.classList.remove('active'));
      tab.classList.add('active');
      const formId = `${tab.dataset.tab}-form`;
      const form = document.getElementById(formId);
      if (form) form.classList.add('active');
    });
  });

  // Login form
  const loginForm = document.getElementById('login-form');
  if (loginForm) {
    loginForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const errEl = document.getElementById('login-error');
      if (errEl) errEl.textContent = '';
      
      const email = document.getElementById('login-email').value;
      const password = document.getElementById('login-password').value;
      
      try {
        await Auth.login(email, password);
        location.reload();
      } catch (err) {
        if (errEl) errEl.textContent = err.message;
      }
    });
  }

  // Signup form
  const signupForm = document.getElementById('signup-form');
  if (signupForm) {
    signupForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const errEl = document.getElementById('signup-error');
      if (errEl) errEl.textContent = '';
      
      const email = document.getElementById('signup-email').value;
      const username = document.getElementById('signup-username').value;
      const displayName = document.getElementById('signup-display').value;
      const password = document.getElementById('signup-password').value;
      
      try {
        await Auth.signup({ email, username, displayName, password });
        location.reload();
      } catch (err) {
        if (errEl) errEl.textContent = err.message;
      }
    });
  }
}

// Run setup immediately since the DOM is already ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', setupAuth);
} else {
  setupAuth();
}
