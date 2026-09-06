const initSqlJs = require('sql.js');
const fs = require('fs');
const path = require('path');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'boniphace.db');

let db;
let SQL;

async function initDatabase() {
  SQL = await initSqlJs();
  
  try {
    if (fs.existsSync(DB_PATH)) {
      const fileBuffer = fs.readFileSync(DB_PATH);
      db = new SQL.Database(fileBuffer);
    } else {
      db = new SQL.Database();
    }
  } catch (err) {
    console.error('Error loading database, creating new one:', err);
    db = new SQL.Database();
  }

  db.run(`CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT, email TEXT UNIQUE NOT NULL, 
    username TEXT UNIQUE NOT NULL, password_hash TEXT NOT NULL, 
    display_name TEXT, language TEXT DEFAULT 'en', 
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP)`);

  db.run(`CREATE TABLE IF NOT EXISTS conversations (
    id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, 
    project_id INTEGER, title TEXT, 
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP)`);

  db.run(`CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT, conversation_id INTEGER NOT NULL, 
    role TEXT NOT NULL, content TEXT NOT NULL, sources TEXT, files TEXT, tool_calls TEXT, 
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP)`);

  db.run(`CREATE TABLE IF NOT EXISTS projects (
    id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, name TEXT NOT NULL, 
    description TEXT, instructions TEXT, color TEXT DEFAULT '#6EE7B7', 
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP)`);

  db.run(`CREATE TABLE IF NOT EXISTS project_files (
    id INTEGER PRIMARY KEY AUTOINCREMENT, project_id INTEGER, user_id INTEGER NOT NULL, 
    filename TEXT NOT NULL, original_name TEXT NOT NULL, mime_type TEXT, size INTEGER, path TEXT NOT NULL, 
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP)`);

  db.run(`CREATE TABLE IF NOT EXISTS memories (
    id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, content TEXT NOT NULL, 
    category TEXT DEFAULT 'general', created_at DATETIME DEFAULT CURRENT_TIMESTAMP)`);

  db.run(`CREATE TABLE IF NOT EXISTS tool_connections (
    id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, tool_name TEXT NOT NULL, 
    enabled INTEGER DEFAULT 1, config TEXT, created_at DATETIME DEFAULT CURRENT_TIMESTAMP, 
    UNIQUE(user_id, tool_name))`);

  db.run(`CREATE TABLE IF NOT EXISTS tool_permissions (
    id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, tool_name TEXT NOT NULL, 
    permission TEXT NOT NULL, granted INTEGER DEFAULT 0)`);

  db.run(`CREATE TABLE IF NOT EXISTS activity_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, action TEXT NOT NULL, 
    details TEXT, ip_address TEXT, created_at DATETIME DEFAULT CURRENT_TIMESTAMP)`);

  db.run(`CREATE TABLE IF NOT EXISTS user_settings (
    id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL UNIQUE, 
    theme TEXT DEFAULT 'dark', language TEXT DEFAULT 'en', answer_depth TEXT DEFAULT 'simple', 
    voice_enabled INTEGER DEFAULT 1, tts_enabled INTEGER DEFAULT 0, 
    memory_enabled INTEGER DEFAULT 1, response_style TEXT DEFAULT 'professional')`);

  saveDatabase();
  console.log('✅ Database initialized successfully');
}

function saveDatabase() {
  if (db) {
    const data = db.export();
    const buffer = Buffer.from(data);
    fs.writeFileSync(DB_PATH, buffer);
  }
}

module.exports = {
  init: initDatabase,
  prepare: (sql) => {
    const stmt = db.prepare(sql);
    return {
      get: (...params) => {
        stmt.bind(params);
        const hasRow = stmt.step();
        const row = hasRow ? stmt.getAsObject() : undefined;
        stmt.reset();
        return row;
      },
      all: (...params) => {
        stmt.bind(params);
        const results = [];
        while (stmt.step()) results.push(stmt.getAsObject());
        stmt.reset();
        return results;
      },
      run: (...params) => {
        stmt.run(params);
        const lastId = stmt.getInsertId();
        const changes = stmt.getRowsModified();
        stmt.reset();
        saveDatabase();
        return { lastInsertRowid: lastId, changes: changes };
      }
    };
  },
  exec: (sql) => { db.run(sql); saveDatabase(); },
  close: () => { if (db) { saveDatabase(); db.close(); } }
};