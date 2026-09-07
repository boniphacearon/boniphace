import { api } from './api.js';
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

// BOOT FUNCTION - AUTO LOGIN
async function boot() {
  // 1. Try to Auto-Login as Admin
  try {
    const response = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'admin', password: 'admin123' })
    });
    
    const data = await response.json();
    if (response.ok) {
      state.token = data.token;
      state.user = data.user;
      localStorage.setItem('bp_token', data.token);
      console.log('✅ Auto-login successful');
    } else {
      console.warn('Auto-login failed:', data.error);
    }
  } catch (err) {
    console.error('Auto-login error:', err);
  }

  // 2. Load the App
  if (state.token) {
    try {
      // If we don't have user details yet, fetch them
      if (!state.user) {
        const me = await Auth.me(state.token);
        state.user = me.user;
        state.settings = me.settings || {};
      }
      showApp();
      await Promise.all([
        Projects.load(),
        Chat.loadConversations(),
        Memory.load(),
        Settings.load()
      ]);
    } catch (err) {
      console.error('App load error:', err);
      document.body.innerHTML = '<h1 style="color:white; text-align:center; margin-top:50px; font-family:sans-serif;">Error loading app. Please refresh.</h1>';
    }
  } else {
    // Fallback if everything fails
    document.body.innerHTML = '<h1 style="color:#6EE7B7; font-family:sans-serif; text-align:center; margin-top:20%;">BONIPHACE<br><span style="font-size:16px; color:white;">Connecting to server...</span></h1>';
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

// Set up all event listeners when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  // Navigation buttons
  document.querySelectorAll('[data-view]').forEach(btn => {
    btn.addEventListener('click', () => {
      switchView(btn.dataset.view);
      if (window.innerWidth <= 768) {
        const sidebar = document.getElementById('sidebar');
        if (sidebar) sidebar.classList.remove('open');
      }
    });
  });

  // Sidebar toggle
  const sidebarToggle = document.getElementById('sidebar-toggle');
  if (sidebarToggle) {
    sidebarToggle.addEventListener('click', () => {
      const sidebar = document.getElementById('sidebar');
      if (sidebar) sidebar.classList.toggle('open');
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

  // Logout button (Just reloads for now since we auto-login)
  const logoutBtn = document.getElementById('logout-btn');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', () => {
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

// Start the app
boot();