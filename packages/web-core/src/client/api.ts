/** Browser-side API client. All calls go to same-origin routes; tokens stay in httpOnly cookies. */

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly code?: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/** Turns an API error body ({ message: string | string[] }) into one readable message. */
export function errorMessage(body: unknown, fallback: string): string {
  if (body && typeof body === 'object' && 'message' in body) {
    const m = (body as { message: unknown }).message;
    if (Array.isArray(m)) return m.filter((x) => typeof x === 'string').join('\n') || fallback;
    if (typeof m === 'string' && m.trim()) return m;
  }
  return fallback;
}

let onSessionExpired: (() => void) | null = null;
/** Registered once by the app shell: redirects to sign-in when the session is gone. */
export function setSessionExpiredHandler(fn: () => void) {
  onSessionExpired = fn;
}

async function request<T>(url: string, init: RequestInit = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, {
      ...init,
      headers: { 'Content-Type': 'application/json', ...(init.headers ?? {}) },
      credentials: 'same-origin',
      cache: 'no-store',
    });
  } catch {
    throw new ApiError(0, 'NETWORK');
  }
  if (res.status === 204) return undefined as T;
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    const code = body && typeof body === 'object' && 'code' in body ? String((body as { code: unknown }).code) : undefined;
    if (res.status === 401 && code === 'SESSION_EXPIRED') onSessionExpired?.();
    throw new ApiError(res.status, errorMessage(body, res.statusText || 'Request failed'), code);
  }
  return body as T;
}

const enc = (body: unknown) => (body === undefined ? undefined : JSON.stringify(body));

export const api = {
  get: <T>(path: string, params?: Record<string, string | number | boolean | undefined | null>) => {
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(params ?? {})) if (v !== undefined && v !== null && v !== '') qs.set(k, String(v));
    const q = qs.toString();
    return request<T>(`/api/proxy/${path}${q ? `?${q}` : ''}`);
  },
  post: <T>(path: string, body?: unknown) => request<T>(`/api/proxy/${path}`, { method: 'POST', body: enc(body) }),
  patch: <T>(path: string, body?: unknown) => request<T>(`/api/proxy/${path}`, { method: 'PATCH', body: enc(body) }),
  put: <T>(path: string, body?: unknown) => request<T>(`/api/proxy/${path}`, { method: 'PUT', body: enc(body) }),
  del: <T>(path: string, body?: unknown) => request<T>(`/api/proxy/${path}`, { method: 'DELETE', body: enc(body) }),
};

/**
 * Downloads a file (CSV, PDF...) from the API through the proxy and hands it to the browser.
 * API errors arrive as JSON and are thrown as ApiError, like any other call.
 */
export async function download(
  path: string,
  params: Record<string, string | number | boolean | undefined | null>,
  fallbackName: string,
): Promise<void> {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null && v !== '') qs.set(k, String(v));
  let res: Response;
  try {
    res = await fetch(`/api/proxy/${path}?${qs.toString()}`, { credentials: 'same-origin', cache: 'no-store' });
  } catch {
    throw new ApiError(0, 'NETWORK');
  }
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    const code = body && typeof body === 'object' && 'code' in body ? String((body as { code: unknown }).code) : undefined;
    if (res.status === 401 && code === 'SESSION_EXPIRED') onSessionExpired?.();
    throw new ApiError(res.status, errorMessage(body, res.statusText || 'Download failed'), code);
  }
  const name = /filename="([^"]+)"/.exec(res.headers.get('content-disposition') ?? '')?.[1] ?? fallbackName;
  const url = URL.createObjectURL(await res.blob());
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export const session = {
  login: (body: { email: string; password: string; companyId?: string }) =>
    request<{ ok: true }>('/api/session/login', { method: 'POST', body: enc(body) }),
  register: (body: unknown) => request<{ ok: true }>('/api/session/register', { method: 'POST', body: enc(body) }),
  logout: () => request<{ ok: true }>('/api/session/logout', { method: 'POST' }),
  switchCompany: (companyId: string) =>
    request<{ ok: true }>('/api/session/switch-company', { method: 'POST', body: enc({ companyId }) }),
  socketToken: () => request<{ accessToken: string; realtimeUrl: string }>('/api/session/token'),
};
