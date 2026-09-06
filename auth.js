const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('./database');

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-me-in-production';

function generateToken(user) {
  return jwt.sign(
    { id: user.id, email: user.email, username: user.username },
    JWT_SECRET,
    { expiresIn: '7d' }
  );
}

function verifyToken(token) {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch {
    return null;
  }
}

// Middleware
function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  const token = authHeader.substring(7);
  const payload = verifyToken(token);
  if (!payload) return res.status(401).json({ error: 'Invalid or expired token' });
  req.user = payload;
  next();
}

async function signup(email, username, password, displayName) {
  email = String(email || '').trim().toLowerCase();
  username = String(username || '').trim().toLowerCase();
  if (!email || !username || !password) throw new Error('All fields are required');
  if (password.length < 8) throw new Error('Password must be at least 8 characters');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('Invalid email');
  if (!/^[a-z0-9_]{3,30}$/.test(username)) throw new Error('Username: 3-30 chars, letters/numbers/underscore');

  const existing = db.prepare('SELECT id FROM users WHERE email = ? OR username = ?').get(email, username);
  if (existing) throw new Error('Email or username already taken');

  const hash = await bcrypt.hash(password, 12);
  const result = db.prepare(
    'INSERT INTO users (email, username, password_hash, display_name) VALUES (?, ?, ?, ?)'
  ).run(email, username, hash, displayName || username);

  db.prepare('INSERT INTO user_settings (user_id) VALUES (?)').run(result.lastInsertRowid);

  const user = { id: result.lastInsertRowid, email, username, display_name: displayName || username };
  return { user, token: generateToken(user) };
}

async function login(emailOrUsername, password) {
  const input = String(emailOrUsername || '').trim().toLowerCase();
  const user = db.prepare('SELECT * FROM users WHERE email = ? OR username = ?').get(input, input);
  if (!user) throw new Error('Invalid credentials');
  const ok = await bcrypt.compare(password, user.password_hash);
  if (!ok) throw new Error('Invalid credentials');
  const safeUser = { id: user.id, email: user.email, username: user.username, display_name: user.display_name };
  return { user: safeUser, token: generateToken(safeUser) };
}

function getUser(userId) {
  return db.prepare('SELECT id, email, username, display_name, language, created_at FROM users WHERE id = ?').get(userId);
}

function updateSettings(userId, settings) {
  const allowed = ['theme','language','answer_depth','voice_enabled','tts_enabled','memory_enabled','response_style'];
  const keys = Object.keys(settings).filter(k => allowed.includes(k));
  if (keys.length === 0) return;
  const setClause = keys.map(k => `${k} = ?`).join(', ');
  const values = keys.map(k => settings[k]);
  values.push(userId);
  db.prepare(`UPDATE user_settings SET ${setClause} WHERE user_id = ?`).run(...values);
}

function getSettings(userId) {
  return db.prepare('SELECT * FROM user_settings WHERE user_id = ?').get(userId) || { user_id: userId };
}

module.exports = { generateToken, verifyToken, authMiddleware, signup, login, getUser, updateSettings, getSettings };