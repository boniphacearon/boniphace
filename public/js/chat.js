import { api } from './app.js';

export const Chat = {
  conversations: [],

  async loadConversations() {
    const data = await api('/api/conversations');
    this.conversations = data.conversations;
    this.renderList();
  },

  renderList() {
    const el = document.getElementById('conversations-list');
    el.innerHTML = '';
    this.conversations.slice(0, 20).forEach(c => {
      const item = document.createElement('div');
      item.className = 'list-item' + (c.id === window.BP.currentConversationId ? ' active' : '');
      item.innerHTML = `<span>${escapeHtml(c.title || 'Chat')}</span>
        <button class="icon-btn" title="Delete" style="width:24px;height:24px;font-size:12px;">✕</button>`;
      item.querySelector('span').onclick = () => this.open(c.id);
      item.querySelector('button').onclick = async (e) => {
        e.stopPropagation();
        if (!confirm('Delete this conversation?')) return;
        await api(`/api/conversations/${c.id}`, { method: 'DELETE' });
        if (window.BP.currentConversationId === c.id) {
          window.BP.currentConversationId = null;
          document.getElementById('messages').innerHTML = '';
        }
        this.loadConversations();
      };
      el.appendChild(item);
    });
  },

  async newConversation() {
    const data = await api('/api/conversations', {
      method: 'POST',
      body: { title: 'New Chat', project_id: window.BP.currentProjectId }
    });
    window.BP.currentConversationId = data.id;
    document.getElementById('messages').innerHTML = '';
    await this.loadConversations();
  },

  async open(id) {
    window.BP.currentConversationId = id;
    const data = await api(`/api/conversations/${id}/messages`);
    const container = document.getElementById('messages');
    container.innerHTML = '';
    data.messages.forEach(m => this.renderMessage(m));
    this.renderList();
    container.scrollTop = container.scrollHeight;
  },

  renderMessage(m) {
    const container = document.getElementById('messages');
    const div = document.createElement('div');
    div.className = `message ${m.role}`;
    const files = safeJson(m.files, []);
    const sources = safeJson(m.sources, []);
    div.innerHTML = `
      <div class="role">${m.role === 'user' ? 'You' : 'BONIPHACE'}</div>
      <div class="content">${renderMarkdown(m.content)}</div>
      ${files.length ? `<div class="files">${files.map(f => `<span class="file-chip">📎 ${escapeHtml(f.name || f)}</span>`).join('')}</div>` : ''}
      ${sources.length ? `<div class="sources"><strong>Sources:</strong><br>${sources.map(s => `<a href="${escapeAttr(s.url)}" target="_blank" rel="noopener">${escapeHtml(s.title)}</a>`).join(' · ')}</div>` : ''}
    `;
    // Copy buttons for code blocks
    div.querySelectorAll('pre').forEach(pre => {
      const btn = document.createElement('button');
      btn.className = 'copy-btn';
      btn.textContent = 'Copy';
      btn.onclick = () => {
        navigator.clipboard.writeText(pre.textContent.replace('Copy', '').trim());
        btn.textContent = 'Copied!';
        setTimeout(() => btn.textContent = 'Copy', 1500);
      };
      pre.appendChild(btn);
    });
    container.appendChild(div);
    container.scrollTop = container.scrollHeight;
    return div;
  },

  async send(text, files = []) {
    if (!text.trim() && files.length === 0) return;
    if (!window.BP.currentConversationId) await this.newConversation();

    // Save user message
    await api(`/api/conversations/${window.BP.currentConversationId}/messages`, {
      method: 'POST',
      body: {
        role: 'user',
        content: text,
        files: files.map(f => ({ name: f.name, size: f.size }))
      }
    });
    this.renderMessage({ role: 'user', content: text, files });

    // Clear input
    document.getElementById('message-input').value = '';
    window.BP.attachedFiles = [];
    document.getElementById('attached-files').innerHTML = '';
    autoResize(document.getElementById('message-input'));

    // Show typing
    const typingDiv = document.createElement('div');
    typingDiv.className = 'message assistant';
    typingDiv.innerHTML = `<div class="role">BONIPHACE</div><div class="content"><div class="typing"><span></span><span></span><span></span></div></div>`;
    document.getElementById('messages').appendChild(typingDiv);
    document.getElementById('messages').scrollTop = document.getElementById('messages').scrollHeight;

    try {
      const reply = await this.callAI(text, files);
      typingDiv.remove();
      await api(`/api/conversations/${window.BP.currentConversationId}/messages`, {
        method: 'POST',
        body: {
          role: 'assistant',
          content: reply.content,
          sources: reply.sources,
          tool_calls: reply.toolCalls
        }
      });
      this.renderMessage({ role: 'assistant', content: reply.content, sources: reply.sources });
      this.loadConversations(); // refresh titles
    } catch (err) {
      typingDiv.remove();
      const errDiv = document.createElement('div');
      errDiv.className = 'message assistant';
      errDiv.innerHTML = `<div class="role">BONIPHACE</div><div class="content" style="color:var(--danger)">Error: ${escapeHtml(err.message)}<br><button class="text-btn" onclick="window.BP.retryLast()">↻ Retry</button></div>`;
      document.getElementById('messages').appendChild(errDiv);
    }
  },

  async callAI(userText, files) {
    // Build conversation history from DB
    const hist = await api(`/api/conversations/${window.BP.currentConversationId}/messages`);
    const messages = [
      { role: 'system', content: buildSystemPrompt() },
      ...hist.messages.map(m => ({ role: m.role === 'tool' ? 'assistant' : m.role, content: m.content }))
    ];

    // Include memory context
    if (window.BP.settings?.memory_enabled) {
      const mem = await api('/api/memories');
      if (mem.memories.length) {
        messages[0].content += `\n\nUSER MEMORIES (use silently, don't list them):\n${mem.memories.map(m => `- ${m.content}`).join('\n')}`;
      }
    }

    // Include file contents (text only)
    const fileContext = [];
    for (const f of files) {
      if (f.text) fileContext.push(`--- FILE: ${f.name} ---\n${f.text.slice(0, 20000)}`);
    }
    if (fileContext.length) {
      messages.push({ role: 'user', content: `[Attached files]\n${fileContext.join('\n\n')}` });
      messages.push({ role: 'user', content: userText });
    }

    // Call Puter.js AI (free, no API key)
    const response = await puter.ai.chat(messages, { model: 'gpt-4o-mini' });
    let content = typeof response === 'string' ? response : (response.message?.content || response.text || '');

    // Parse memory commands
    const memoryMatch = content.match(/```memory\s*\n([\s\S]*?)\n```/);
    if (memoryMatch) {
      try {
        const cmd = JSON.parse(memoryMatch[1]);
        if (cmd.action === 'add') {
          await api('/api/memories', { method: 'POST', body: { content: cmd.content, category: cmd.category || 'general' } });
        } else if (cmd.action === 'forget') {
          // Delete by keyword match
          const mems = await api('/api/memories');
          for (const m of mems.memories) {
            if (m.content.toLowerCase().includes(cmd.keyword.toLowerCase())) {
              await api(`/api/memories/${m.id}`, { method: 'DELETE' });
            }
          }
        }
        content = content.replace(memoryMatch[0], '').trim();
      } catch {}
    }

    // Parse sources
    let sources = [];
    const srcMatch = content.match(/```sources\s*\n([\s\S]*?)\n```/);
    if (srcMatch) {
      try { sources = JSON.parse(srcMatch[1]); } catch {}
      content = content.replace(srcMatch[0], '').trim();
    }

    // Parse tool calls
    let toolCalls = [];
    const toolMatch = content.match(/```tool\s*\n([\s\S]*?)\n```/);
    if (toolMatch) {
      try {
        const call = JSON.parse(toolMatch[1]);
        content = content.replace(toolMatch[0], '').trim();
        // Execute tool
        try {
          const result = await api('/api/tools/execute', { method: 'POST', body: call });
          toolCalls.push({ ...call, result: result.result });
          // Feed result back to AI for final answer
          messages.push({ role: 'assistant', content });
          messages.push({ role: 'user', content: `Tool result for ${call.name}:\n${JSON.stringify(result.result, null, 2)}\n\nNow answer the user's original question using this data.` });
          const r2 = await puter.ai.chat(messages, { model: 'gpt-4o-mini' });
          content = typeof r2 === 'string' ? r2 : (r2.message?.content || r2.text || '');
        } catch (e) {
          content += `\n\n_Tool ${call.name} failed: ${e.message}_`;
        }
      } catch {}
    }

    return { content, sources, toolCalls };
  }
};

function buildSystemPrompt() {
  const depth = window.BP.settings?.answer_depth === 'deep'
    ? '\n\nMODE: DEEP — Provide technical detail, underlying mechanisms, real implementation notes, edge cases, and inline numbered citations [1][2] next to specific claims.'
    : '\n\nMODE: SIMPLE — Be concise, plain-language, minimal jargon.';
  return `You are BONIPHACE, a personal AI assistant. Be intelligent, helpful, professional, friendly, clear, honest, and patient.

Core traits:
- Communicate in English and Kiswahili, switching naturally when the user does.
- For technical questions, use step-by-step explanations.
- Provide complete working code when asked.
- If uncertain, say so. Never invent facts.
- Never claim an action was completed unless a tool actually executed it.

Domain depth: IT, Computer Science, Computer Engineering — networking, algorithms, data structures, OS, hardware, programming, cybersecurity, cloud, databases, system design.

When the user asks you to REMEMBER something, respond with a JSON block on its own line:
\`\`\`memory
{"action":"add","content":"<the fact>","category":"general"}
\`\`\`
When the user asks you to FORGET something:
\`\`\`memory
{"action":"forget","keyword":"<keyword>"}
\`\`\`

When you use verifiable sources, include a SOURCES section at the end:
\`\`\`sources
[{"title":"...","url":"..."}]
\`\`\`
Only include real, authoritative sources. If no source exists, say so.

When a tool should be used (web_search, calculator, weather), respond with:
\`\`\`tool
{"name":"<tool_name>","args":{...}}
\`\`\`
Available tools: web_search, calculator, weather.${depth}`;
}

// ---------- UI WIRING ----------
const input = document.getElementById('message-input');
const sendBtn = document.getElementById('send-btn');

input.addEventListener('input', () => autoResize(input));
input.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    send();
  }
});
sendBtn.addEventListener('click', send);

async function send() {
  const text = input.value;
  const files = [...window.BP.attachedFiles];
  sendBtn.disabled = true;
  try {
    await Chat.send(text, files);
  } finally {
    sendBtn.disabled = false;
  }
}
window.BP_retryLast = () => {
  const msgs = document.querySelectorAll('#messages .message.user');
  const last = msgs[msgs.length - 1];
  if (last) {
    const content = last.querySelector('.content').textContent;
    Chat.send(content, []);
  }
};

// File uploads
document.getElementById('file-input').addEventListener('change', async (e) => {
  for (const file of e.target.files) {
    const fd = new FormData();
    fd.append('file', file);
    const uploaded = await api('/api/files/upload', { method: 'POST', body: fd });
    const text = await readTextPreview(file);
    window.BP.attachedFiles.push({ ...uploaded, text });
    renderAttached();
  }
  e.target.value = '';
});

function renderAttached() {
  const el = document.getElementById('attached-files');
  el.innerHTML = window.BP.attachedFiles.map((f, i) =>
    `<span class="file-chip">📎 ${escapeHtml(f.name)} <button onclick="window.BP.detachFile(${i})" style="background:none;color:var(--danger);margin-left:4px;">✕</button></span>`
  ).join('');
}
window.BP.detachFile = (i) => {
  window.BP.attachedFiles.splice(i, 1);
  renderAttached();
};

async function readTextPreview(file) {
  const textTypes = ['text/', 'application/json', 'application/javascript', 'application/xml'];
  const textExts = ['.txt','.md','.csv','.json','.js','.ts','.py','.java','.c','.cpp','.h','.php','.html','.css','.sql','.xml','.yml','.yaml','.sh','.rb','.go','.rs'];
  const isText = textTypes.some(t => file.type.startsWith(t)) || textExts.some(ext => file.name.toLowerCase().endsWith(ext));
  if (isText) return await file.text();
  return null;
}

// ---------- HELPERS ----------
function autoResize(el) {
  el.style.height = 'auto';
  el.style.height = Math.min(el.scrollHeight, 200) + 'px';
}
function escapeHtml(s) {
  return String(s || '').replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
}
function escapeAttr(s) { return escapeHtml(s); }
function safeJson(s, def) {
  if (!s) return def;
  if (typeof s === 'object') return s;
  try { return JSON.parse(s); } catch { return def; }
}

// Minimal markdown renderer (code blocks, bold, italic, links, lists, tables)
function renderMarkdown(text) {
  if (!text) return '';
  let html = escapeHtml(text);
  // Code blocks
  html = html.replace(/```(\w*)\n([\s\S]*?)```/g, (_, lang, code) =>
    `<pre><code class="lang-${lang}">${code}</code></pre>`);
  // Inline code
  html = html.replace(/`([^`]+)`/g, '<code>$1</code>');
  // Headers
  html = html.replace(/^### (.+)$/gm, '<h3>$1</h3>');
  html = html.replace(/^## (.+)$/gm, '<h2>$1</h2>');
  html = html.replace(/^# (.+)$/gm, '<h1>$1</h1>');
  // Bold / italic
  html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/\*([^*]+)\*/g, '<em>$1</em>');
  // Links
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
  // Lists
  html = html.replace(/^- (.+)$/gm, '<li>$1</li>');
  html = html.replace(/(<li>.*<\/li>\n?)+/g, m => `<ul>${m}</ul>`);
  // Paragraphs
  html = html.split(/\n\n+/).map(p => {
    if (/^<(h\d|ul|ol|pre|table)/.test(p.trim())) return p;
    return `<p>${p.replace(/\n/g, '<br>')}</p>`;
  }).join('');
  return html;
}