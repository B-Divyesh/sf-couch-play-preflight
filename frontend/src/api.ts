import type { InputKind, Snapshot } from './model';

async function request<T>(url: string, options?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(url, {
      ...options,
      headers: { 'content-type': 'application/json', ...(options?.headers || {}) },
    });
  } catch {
    throw new Error('Room Ready could not reach the session service. Check your connection and try again.');
  }
  if (!response.ok) {
    const body = await response.json().catch(() => ({})) as { error?: string };
    throw new Error(body.error || `The session service returned ${response.status}.`);
  }
  return response.status === 204 ? undefined as T : response.json() as Promise<T>;
}

export const api = {
  create: (game_label: string) => request<{ code: string; host_token: string; expires_at: string }>('/api/rooms', { method: 'POST', body: JSON.stringify({ game_label }) }),
  get: (code: string) => request<Snapshot>(`/api/rooms/${code}`),
  join: (code: string, name: string, input_kind: InputKind) => request<{ player_id: string; player_token: string }>(`/api/rooms/${code}/join`, { method: 'POST', body: JSON.stringify({ name, input_kind }) }),
  updatePlayer: (code: string, playerId: string, payload: object) => request<void>(`/api/rooms/${code}/players/${playerId}`, { method: 'PUT', body: JSON.stringify(payload) }),
  updateRoom: (code: string, payload: object) => request<void>(`/api/rooms/${code}`, { method: 'PUT', body: JSON.stringify(payload) }),
  close: (code: string, host_token: string) => request<void>(`/api/rooms/${code}`, { method: 'DELETE', body: JSON.stringify({ host_token }) }),
};
