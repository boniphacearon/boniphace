// API helper - shared by all modules
export async function api(path, options = {}) {
  const state = window.BP || {};
  const headers = { ...(options.headers || {}) };
  
  if (state.token) {
    headers['Authorization'] = `Bearer ${state.token}`;
  }
  
  if (!(options.body instanceof FormData) && options.body && typeof options.body === 'object') {
    headers['Content-Type'] = 'application/json';
    options.body = JSON.stringify(options.body);
  }
  
  try {
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
  } catch (err) {
    console.error('API Error:', err);
    throw err;
  }
}
