/**
 * AI Service Layer
 * Default: Puter.js (free, no API key)
 * Optional: OpenAI-compatible endpoint via env vars
 */

const SYSTEM_PROMPT = `You are BONIPHACE, a personal AI assistant. Be intelligent, helpful, professional, friendly, clear, honest, and patient.

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
[{"title":"...","url":"..."},{"title":"...","url":"..."}]
\`\`\`
Only include real, authoritative sources (official docs, IEEE, IETF, W3C, vendor sites). If no source exists, say so.

When a tool should be used (web search, calculator, etc.), respond with:
\`\`\`tool
{"name":"<tool_name>","args":{...}}
\`\`\`
Wait for the tool result before continuing.`;

async function callAI({ messages, settings, tools = [] }) {
  const provider = (process.env.AI_PROVIDER || 'puter').toLowerCase();

  if (provider === 'openai' && process.env.OPENAI_API_KEY) {
    return await callOpenAI(messages, settings, tools);
  }
  // Default: Puter.js (free, no key)
  return await callPuter(messages, settings, tools);
}

async function callPuter(messages, settings) {
  // Puter.js is a browser-side SDK. The server builds the payload and the
  // frontend actually invokes puter.ai.chat(). For server-side fallback we
  // use a simple echo explaining this. Real calls happen in public/js/chat.js.
  return {
    mode: 'client',
    provider: 'puter',
    systemPrompt: SYSTEM_PROMPT,
    messages,
    settings
  };
}

async function callOpenAI(messages, settings) {
  const baseUrl = process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1';
  const model = process.env.OPENAI_MODEL || 'gpt-4o-mini';
  const res = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`
    },
    body: JSON.stringify({
      model,
      messages,
      temperature: settings?.temperature ?? 0.7
    })
  });
  if (!res.ok) throw new Error(`AI provider error: ${res.status}`);
  const data = await res.json();
  return { content: data.choices?.[0]?.message?.content || '', mode: 'server' };
}

function buildSystemPrompt(settings) {
  const depth = settings?.answer_depth === 'deep'
    ? '\n\nMODE: DEEP — Provide technical detail, underlying mechanisms, real implementation notes, edge cases, and inline numbered citations [1][2] next to specific claims.'
    : '\n\nMODE: SIMPLE — Be concise, plain-language, minimal jargon.';
  return SYSTEM_PROMPT + depth;
}

module.exports = { callAI, buildSystemPrompt, SYSTEM_PROMPT };