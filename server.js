require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const db = require('./database');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-me-in-production';
const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(__dirname, 'uploads');
const MAX_FILE_SIZE = (parseInt(process.env.MAX_FILE_SIZE_MB) || 25) * 1024 * 1024;

fs.mkdirSync(UPLOAD_DIR, { recursive: true });
fs.mkdirSync(path.join(UPLOAD_DIR, 'user-files'), { recursive: true });

// Security & Middleware
app.use(helmet({ contentSecurityPolicy: false })); // Disabled CSP for easier PWA setup
app.use(cors());
app.use(express.json({ limit: '5mb' }));

const limiter = rateLimit({ windowMs: 60_000, max: 120 });
app.use('/api/', limiter);

// File upload setup
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const userId = req.user ? req.user.id : 'anon';
    const userDir = path.join(UPLOAD_DIR, 'user-files', String(userId));
    fs.mkdirSync(userDir, { recursive: true });
    cb(null, userDir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `${Date.now()}-${crypto.randomBytes(8).toString('hex')}${ext}`);
  }
});
const upload = multer({ storage, limits: { fileSize: MAX_FILE_SIZE } });

// Auth Middleware
function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  const token = authHeader.substring(7);
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: 'Invalid or expired token' });
  }
}

function generateToken(user) {
  return jwt.sign({ id: user.id, email: user.email, username: user.username }, JWT_SECRET, { expiresIn: '7d' });
}

function logActivity(userId, action, details) {
  try {
    db.prepare('INSERT INTO activity_logs (user_id, action, details) VALUES (?, ?, ?)').run(userId, action, JSON.stringify(details || {}));
  } catch (e) { console.error('Log error:', e); }
}

// Static files
app.use(express.static(path.join(__dirname, 'public'), {
  setHeaders: (res, filePath) => { if (filePath.endsWith('sw.js')) res.setHeader('Cache-Control', 'no-cache'); }
}));

// --- AUTH ROUTES ---
app.post('/api/auth/signup', async (req, res) => {
  try {
    const { email, username, password, displayName } = req.body;
    if (!email || !username || !password) throw new Error('All fields required');
    if (password.length < 8) throw new Error('Password min 8 chars');
    
    const existing = db.prepare('SELECT id FROM users WHERE email = ? OR username = ?').get(email.toLowerCase(), username.toLowerCase());
    if (existing) throw new Error('Email or username taken');

    const hash = await bcrypt.hash(password, 12);
    const result = db.prepare('INSERT INTO users (email, username, password_hash, display_name) VALUES (?, ?, ?, ?)').run(email.toLowerCase(), username.toLowerCase(), hash, displayName || username);
    db.prepare('INSERT INTO user_settings (user_id) VALUES (?)').run(result.lastInsertRowid);
    
    const user = { id: result.lastInsertRowid, email: email.toLowerCase(), username: username.toLowerCase(), display_name: displayName || username };
    logActivity(user.id, 'signup', { ip: req.ip });
    res.json({ user, token: generateToken(user) });
  } catch (e) { res.status(400).json({ error: e.message }); }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = db.prepare('SELECT * FROM users WHERE email = ? OR username = ?').get(email.toLowerCase(), email.toLowerCase());
    if (!user) throw new Error('Invalid credentials');
    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) throw new Error('Invalid credentials');
    
    const safeUser = { id: user.id, email: user.email, username: user.username, display_name: user.display_name };
    logActivity(user.id, 'login', { ip: req.ip });
    res.json({ user: safeUser, token: generateToken(safeUser) });
  } catch (e) { res.status(401).json({ error: e.message }); }
});

app.get('/api/auth/me', authMiddleware, (req, res) => {
  const user = db.prepare('SELECT id, email, username, display_name, language, created_at FROM users WHERE id = ?').get(req.user.id);
  const settings = db.prepare('SELECT * FROM user_settings WHERE user_id = ?').get(req.user.id);
  res.json({ user, settings: settings || {} });
});

// --- CONVERSATIONS ---
app.get('/api/conversations', authMiddleware, (req, res) => {
  const rows = db.prepare('SELECT c.*, COUNT(m.id) as message_count FROM conversations c LEFT JOIN messages m ON m.conversation_id = c.id WHERE c.user_id = ? GROUP BY c.id ORDER BY c.updated_at DESC').all(req.user.id);
  res.json({ conversations: rows });
});

app.post('/api/conversations', authMiddleware, (req, res) => {
  const { title, project_id } = req.body;
  const result = db.prepare('INSERT INTO conversations (user_id, project_id, title) VALUES (?, ?, ?)').run(req.user.id, project_id || null, title || 'New Conversation');
  res.json({ id: result.lastInsertRowid, title: title || 'New Conversation' });
});

app.delete('/api/conversations/:id', authMiddleware, (req, res) => {
  const conv = db.prepare('SELECT id FROM conversations WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
  if (!conv) return res.status(404).json({ error: 'Not found' });
  db.prepare('DELETE FROM conversations WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

app.get('/api/conversations/:id/messages', authMiddleware, (req, res) => {
  const conv = db.prepare('SELECT id FROM conversations WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
  if (!conv) return res.status(404).json({ error: 'Not found' });
  const messages = db.prepare('SELECT * FROM messages WHERE conversation_id = ? ORDER BY created_at ASC').all(req.params.id);
  res.json({ messages });
});

app.post('/api/conversations/:id/messages', authMiddleware, (req, res) => {
  const conv = db.prepare('SELECT id FROM conversations WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
  if (!conv) return res.status(404).json({ error: 'Not found' });
  const { role, content, sources, files, tool_calls } = req.body;
  const result = db.prepare('INSERT INTO messages (conversation_id, role, content, sources, files, tool_calls) VALUES (?, ?, ?, ?, ?, ?)').run(req.params.id, role, content, JSON.stringify(sources||null), JSON.stringify(files||null), JSON.stringify(tool_calls||null));
  db.prepare('UPDATE conversations SET updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(req.params.id);
  res.json({ id: result.lastInsertRowid });
});

// --- PROJECTS ---
app.get('/api/projects', authMiddleware, (req, res) => {
  const rows = db.prepare('SELECT * FROM projects WHERE user_id = ? ORDER BY updated_at DESC').all(req.user.id);
  res.json({ projects: rows });
});

app.post('/api/projects', authMiddleware, (req, res) => {
  const { name, description, instructions, color } = req.body;
  if (!name) return res.status(400).json({ error: 'Name required' });
  const result = db.prepare('INSERT INTO projects (user_id, name, description, instructions, color) VALUES (?, ?, ?, ?, ?)').run(req.user.id, name, description || '', instructions || '', color || '#6EE7B7');
  res.json({ id: result.lastInsertRowid });
});

app.delete('/api/projects/:id', authMiddleware, (req, res) => {
  const p = db.prepare('SELECT id FROM projects WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
  if (!p) return res.status(404).json({ error: 'Not found' });
  db.prepare('DELETE FROM projects WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// --- FILES ---
app.post('/api/files/upload', authMiddleware, upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file' });
  const { project_id } = req.body;
  db.prepare('INSERT INTO project_files (project_id, user_id, filename, original_name, mime_type, size, path) VALUES (?, ?, ?, ?, ?, ?, ?)').run(project_id || null, req.user.id, req.file.filename, req.file.originalname, req.file.mimetype, req.file.size, req.file.path);
  res.json({ id: req.file.filename, name: req.file.originalname, size: req.file.size, mime: req.file.mimetype, path: req.file.path });
});

app.get('/api/files', authMiddleware, (req, res) => {
  const rows = db.prepare('SELECT * FROM project_files WHERE user_id = ? ORDER BY created_at DESC LIMIT 50').all(req.user.id);
  res.json({ files: rows });
});

// --- MEMORIES ---
app.get('/api/memories', authMiddleware, (req, res) => {
  const rows = db.prepare('SELECT * FROM memories WHERE user_id = ? ORDER BY created_at DESC').all(req.user.id);
  res.json({ memories: rows });
});

app.post('/api/memories', authMiddleware, (req, res) => {
  const { content, category } = req.body;
  if (!content) return res.status(400).json({ error: 'Content required' });
  const result = db.prepare('INSERT INTO memories (user_id, content, category) VALUES (?, ?, ?)').run(req.user.id, content, category || 'general');
  res.json({ id: result.lastInsertRowid });
});

app.delete('/api/memories/:id', authMiddleware, (req, res) => {
  db.prepare('DELETE FROM memories WHERE id = ? AND user_id = ?').run(req.params.id, req.user.id);
  res.json({ ok: true });
});

app.delete('/api/memories', authMiddleware, (req, res) => {
  db.prepare('DELETE FROM memories WHERE user_id = ?').run(req.user.id);
  res.json({ ok: true });
});

// --- TOOLS ---
const TOOLS = {
  web_search: { name: 'web_search', description: 'Search the public web', requiresConfirmation: false, async execute({ query }) { return { results: [{ title: 'Search result', snippet: 'Demo result for: ' + query }] }; } },
  calculator: { name: 'calculator', description: 'Evaluate math', requiresConfirmation: false, async execute({ expression }) { try { const val = Function(`"use strict"; return (${expression.replace(/[^0-9+\-*/().]/g,'')});`)(); return { expression, value: val }; } catch { return { error: 'Invalid math' }; } } },
  weather: { name: 'weather', description: 'Get weather', requiresConfirmation: false, async execute({ location }) { return { location, temp_c: 25, description: 'Sunny' }; } }
};

app.get('/api/tools', authMiddleware, (req, res) => {
  const tools = Object.values(TOOLS).map(t => ({ ...t, enabled: true }));
  res.json({ tools });
});

app.post('/api/tools/:name/toggle', authMiddleware, (req, res) => { res.json({ ok: true }); });

app.post('/api/tools/execute', authMiddleware, async (req, res) => {
  try {
    const { name, args } = req.body;
    const tool = TOOLS[name];
    if (!tool) throw new Error('Unknown tool');
    const result = await tool.execute(args || {});
    res.json({ result });
  } catch (e) { res.status(400).json({ error: e.message }); }
});

// --- SETTINGS ---
app.get('/api/settings', authMiddleware, (req, res) => {
  const settings = db.prepare('SELECT * FROM user_settings WHERE user_id = ?').get(req.user.id);
  res.json({ settings: settings || {} });
});

app.put('/api/settings', authMiddleware, (req, res) => {
  const { theme, language, answer_depth, voice_enabled, tts_enabled, memory_enabled, response_style } = req.body;
  db.prepare(`UPDATE user_settings SET theme=?, language=?, answer_depth=?, voice_enabled=?, tts_enabled=?, memory_enabled=?, response_style=? WHERE user_id=?`).run(theme||'dark', language||'en', answer_depth||'simple', voice_enabled??1, tts_enabled??0, memory_enabled??1, response_style||'professional', req.user.id);
  res.json({ ok: true });
});

// --- DASHBOARD ---
app.get('/api/dashboard', authMiddleware, (req, res) => {
  const recentConvs = db.prepare('SELECT id, title, updated_at FROM conversations WHERE user_id = ? ORDER BY updated_at DESC LIMIT 5').all(req.user.id);
  const projects = db.prepare('SELECT id, name, color FROM projects WHERE user_id = ? LIMIT 5').all(req.user.id);
  const files = db.prepare('SELECT id, original_name, created_at FROM project_files WHERE user_id = ? ORDER BY created_at DESC LIMIT 5').all(req.user.id);
  const memCount = db.prepare('SELECT COUNT(*) as count FROM memories WHERE user_id = ?').get(req.user.id);
  res.json({ recentConversations: recentConvs, projects, files, memoryCount: memCount?.count || 0, activity: [] });
});

// SPA Fallback
app.get('*', (req, res) => { res.sendFile(path.join(__dirname, 'public', 'index.html')); });

// START SERVER
async function startServer() {
  await db.init();
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`🟢 BONIPHACE running on http://localhost:${PORT}`);
  });
}

startServer().catch(err => { console.error('Fatal error:', err); process.exit(1); });