export const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000/api/v1';

export async function api(path, options = {}) {
  const xsrf = document.cookie.split('; ').find(row => row.startsWith('XSRF-TOKEN='))?.split('=').slice(1).join('=');
  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    credentials: 'include',
    headers: { Accept: 'application/json', ...(options.body instanceof FormData ? {} : { 'Content-Type': 'application/json' }), ...(xsrf ? { 'X-XSRF-TOKEN': decodeURIComponent(xsrf) } : {}), ...options.headers },
  });
  if (!response.ok) {
    const error = new Error((await response.json().catch(() => ({}))).message || 'Request failed');
    error.status = response.status;
    throw error;
  }
  return response.status === 204 ? null : response.json();
}

export async function csrf() {
  await fetch(`${API_BASE.replace(/\/api\/v1$/, '')}/sanctum/csrf-cookie`, { credentials: 'include' });
}
