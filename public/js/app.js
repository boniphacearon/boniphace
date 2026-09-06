import { Auth } from './auth.js';
import { Chat } from './chat.js';
import { Memory } from './memory.js';
import { Voice } from './voice.js';
import { Projects } from './projects.js';
import { Settings } from './settings.js';

// State object
const state = {
  token: localStorage.getItem('bp_token'),
  user: null,
  settings: {},
  currentConversationId: null,
  currentProjectId: null,
  currentView: 'chat',
  attachedFiles: []
};

window.BP = state;

// BOOT FUNCTION
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
  const authScreen = document.getElementById('auth-screen');
  const appScreen = document.getElementById('app-screen');
  if (authScreen) authScreen.classList.add('active');
  if (appScreen) appScreen.classList.remove('active');
}

function showApp() {
  const authScreen = document.getElementById('auth-screen');
  const appScreen = document.getElementById('app-screen');
  if (authScreen) authScreen.classList.remove('active');
  if (appScreen) appScreen.classList.add('active');
}

// NAVIGATION
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
  const titleEl = document.getElementById('view-title');
  if (titleEl) titleEl.textContent = titles[view] || '';
}

// Event Listeners
document.addEventListener('DOMContentLoaded', () => {
  // Navigation buttons
  document.querySelectorAll('[data-view]').forEach(btn => {
    btn.addEventListener('click', () => {
      switchView(btn.dataset.view);
      if (window.innerWidth <= 768) {
        document.getElementById('sidebar').classList.remove('open');
      }
    });
  });

  // Sidebar toggle
  const sidebarToggle = document.getElementById('sidebar-toggle');
  if (sidebarToggle) {
    sidebarToggle.addEventListener('click', () => {
      document.getElementById('sidebar').classList.toggle('open');
    });
  }

  // New chat button
  const newChatBtn = document.getElementById('new-chat-btn');
  if (newChatBtn) {
    newChatBtn.addEventListener('click', () => Chat.newConversation());
  }

  // New project button
  const newProjectBtn = document.getElementById('new-project-btn');
  if (newProjectBtn) {
    newProjectBtn.addEventListener('click', () => Projects.create());
  }

  // Logout button
  const logoutBtn = document.getElementById('logout-btn');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', () => {
      localStorage.removeItem('bp_token');
      location.reload();
    });
  }

  // Depth toggle
  const depthSimple = document.getElementById('depth-simple');
  const depthDeep = document.getElementById('depth-deep');
  
  if (depthSimple) {
    depthSimple.addEventListener('click', () => applyDepth('simple'));
  }
  if (depthDeep) {
    depthDeep.addEventListener('click', () => applyDepth('deep'));
  }

  // Install button
  setupInstallPrompt();
});

function applyDepth(depth) {
  state.settings.answer_depth = depth;
  const depthSimple = document.getElementById('depth-simple');
  const depthDeep = document.getElementById('depth-deep');
  
  if (depthSimple) depthSimple.classList.toggle('active', depth === 'simple');
  if (depthDeep) depthDeep.classList.toggle('active', depth === 'deep');
  
  Settings.save({ answer_depth: depth });
}

// PWA Functions
function registerSW() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js').catch(err => console.warn('SW failed', err));
  }
}

let deferredPrompt = null;

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

// API Helper
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
