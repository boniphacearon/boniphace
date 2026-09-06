const db = require('./database');

/**
 * Tool registry. Each tool has:
 *  - name, description
 *  - requiresConfirmation (for consequential actions)
 *  - execute(args, userId) -> result
 */
const TOOLS = {
  web_search: {
    name: 'web_search',
    description: 'Search the public web for current information',
    requiresConfirmation: false,
    async execute({ query }) {
      // Uses DuckDuckGo instant-answer as a free, no-key option.
      // For richer results, swap in Serper/Bing/SerpAPI via env vars.
      const url = `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1`;
      const res = await fetch(url, { headers: { 'User-Agent': 'BoniphaceAI/1.0' } });
      const data = await res.json();
      const results = [];
      if (data.Abstract) results.push({ title: data.Heading, snippet: data.Abstract, url: data.AbstractURL });
      (data.RelatedTopics || []).slice(0, 6).forEach(t => {
        if (t.FirstURL) results.push({ title: t.Text?.split(' - ')[0] || t.Text, snippet: t.Text, url: t.FirstURL });
      });
      return { results };
    }
  },
  calculator: {
    name: 'calculator',
    description: 'Evaluate a mathematical expression safely',
    requiresConfirmation: false,
    async execute({ expression }) {
      // Whitelist-based evaluator
      const safe = String(expression).replace(/\s+/g, '');
      if (!/^[\d+\-*/().^%e]+$/.test(safe)) throw new Error('Invalid expression');
      const js = safe.replace(/\^/g, '**');
      // eslint-disable-next-line no-new-func
      const value = Function(`"use strict"; return (${js});`)();
      return { expression, value };
    }
  },
  weather: {
    name: 'weather',
    description: 'Get current weather for a location (wttr.in)',
    requiresConfirmation: false,
    async execute({ location }) {
      const res = await fetch(`https://wttr.in/${encodeURIComponent(location)}?format=j1`);
      const data = await res.json();
      const cur = data.current_condition?.[0];
      if (!cur) throw new Error('Weather unavailable');
      return {
        location,
        temp_c: cur.temp_C,
        feels_like: cur.FeelsLikeC,
        description: cur.weatherDesc?.[0]?.value,
        humidity: cur.humidity,
        wind_kmph: cur.windspeedKmph
      };
    }
  }
};

function getAvailableTools(userId) {
  const enabled = db.prepare(
    "SELECT tool_name FROM tool_connections WHERE user_id = ? AND enabled = 1"
  ).all(userId).map(r => r.tool_name);
  // Default tools always available unless explicitly disabled
  const defaults = Object.keys(TOOLS);
  return defaults.filter(t => !enabled.includes(t) || enabled.includes(t));
}

function isToolEnabled(userId, toolName) {
  const row = db.prepare('SELECT enabled FROM tool_connections WHERE user_id = ? AND tool_name = ?').get(userId, toolName);
  if (!row) return true; // default enabled
  return !!row.enabled;
}

function setToolEnabled(userId, toolName, enabled) {
  db.prepare(`
    INSERT INTO tool_connections (user_id, tool_name, enabled)
    VALUES (?, ?, ?)
    ON CONFLICT(user_id, tool_name) DO UPDATE SET enabled = excluded.enabled
  `).run(userId, toolName, enabled ? 1 : 0);
}

async function executeTool(userId, toolName, args) {
  const tool = TOOLS[toolName];
  if (!tool) throw new Error(`Unknown tool: ${toolName}`);
  if (!isToolEnabled(userId, toolName)) throw new Error(`Tool ${toolName} is disabled`);
  return await tool.execute(args || {});
}

function listTools() {
  return Object.values(TOOLS).map(t => ({
    name: t.name,
    description: t.description,
    requiresConfirmation: t.requiresConfirmation
  }));
}

module.exports = { TOOLS, getAvailableTools, isToolEnabled, setToolEnabled, executeTool, listTools };