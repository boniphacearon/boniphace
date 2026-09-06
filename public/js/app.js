// Initialize state FIRST
const state = {
  token: null,
  user: null,
  settings: {},
  currentConversationId: null,
  currentProjectId: null,
  currentView: 'chat',
  attachedFiles: []
};

window.BP = state;

// Import modules AFTER state is defined
import { Auth } from './auth.js';
import { Chat } from './chat.js';
import { Memory } from './memory.js';
import { Voice } from './voice.js';
import { Projects } from './projects.js';
import { Settings } from './settings.js';

// Load token from storage
state.token = localStorage.getItem('bp_token');

// ---------- BOOT ----------
async function boot() {
  if (state.token) {
    try {
      const me = await Auth.me(state.token);
      state.user = me.user;
      state.settings = me.settings || {};
      showApp();
      await Promise.all([
        Projects.load(),
        Chat.loadConversations(),
        Memory.load(),
        Settings.load()
      ]);
    } catch {
      localStorage.removeItem('bp_token');
      state.token = null;
      showAuth();
    }
  } else {
    showAuth();
  }
  registerSW();
  setupInstallPrompt();
}

function showAuth() {
  document.getElementById('auth-screen').classList.add('active');
  document.getElementById('app-screen').classList.remove('active');
}

function showApp() {
  document.getElementById('auth-screen').classList.remove('active');
  document.getElementById('app-screen').classList.add('active');
  switchView('chat');
  applyDepth(state.settings.answer_depth || 'simple');
}

// ---------- NAV ----------
function switchView(view) {
  state.currentView = view;
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  const el = document.getElementById(`view-${view}`);
  if (el) el.classList.add('active');
  const titles = {
    chat: 'BONIPHACE — Your Personal AI Assistant',
    dashboard: 'Dashboard',
    memory: 'Memory',
    tools: 'Tools',
    settings: 'Settings'
  };
  document.getElementById('view-title').textContent = titles[view] || '';
}

document.querySelectorAll('[data-view]').forEach(btn => {
  btn.addEventListener('click', () => {
    switchView(btn.dataset.view);
    if (window.innerWidth <= 768) document.getElementById('sidebar').classList.remove('open');
  });
});

document.getElementById('sidebar-toggle').addEventListener('click', () => {
  document.getElementById('sidebar').classList.toggle('open');
});

document.getElementById('new-chat-btn').addEventListener('click', () => Chat.newConversation());
document.getElementById('new-project-btn').addEventListener('click', () => Projects.create());
document.getElementById('logout-btn').addEventListener('click', () => {
  localStorage.removeItem('bp_token');
  location.reload();
});

// Depth toggle
document.getElementById('depth-simple').addEventListener('click', () => applyDepth('simple'));
document.getElementById('depth-deep').addEventListener('click', () => applyDepth('deep'));

function applyDepth(depth) {
  state.settings.answer_depth = depth;
  document.getElementById('depth-simple').classList.toggle('active', depth === 'simple');
  document.getElementById('depth-deep').classList.toggle('active', depth === 'deep');
  Settings.save({ answer_depth: depth });
}

// ---------- PWA ----------
function registerSW() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js').catch(err => console.warn('SW failed', err));
  }
}

let deferredPrompt;
function setupInstallPrompt() {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    const installBtn = document.getElementById('install-btn');
    if (installBtn) installBtn.classList.remove('hidden');
  });
  const installBtn = document.getElementById('install-btn');
  if (installBtn) {
    installBtn.addEventListener('click', async () => {
      if (!deferredPrompt) return;
      deferredPrompt.prompt();
      await deferredPrompt.userChoice;
      deferredPrompt = null;
      installBtn.classList.add('hidden');
    });
  }
}

// ---------- UTIL ----------
export async function api(path, options = {}) {
  const headers = { ...(options.headers || {}) };
  if (state.token) headers['Authorization'] = `Bearer ${state.token}`;
  if (!(options.body instanceof FormData) && options.body && typeof options.body === 'object') {
    headers['Content-Type'] = 'application/json';
    options.body = JSON.stringify(options.body);
  }
  const res = await fetch(path, { ...options, headers });
  if (res.status === 401) {
    localStorage.removeItem('bp_token');
    location.reload();
    throw new Error('Session expired');
  }
  const text = await res.text();
  const data = text ? JSON.parse(text) : {};
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
}

// Start the app
boot();
