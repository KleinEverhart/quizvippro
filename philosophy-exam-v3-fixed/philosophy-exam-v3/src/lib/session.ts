import { createHmac, timingSafeEqual } from 'node:crypto';

export const SESSION_COOKIE = 'pe_session';
const SIX_HOURS_MS = 6 * 60 * 60 * 1000;

export type Role = 'student' | 'admin';
export type SessionPayload = { pid: string; role: Role; exp: number };

function secret(): string {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 32) throw new Error('SESSION_SECRET phải có ít nhất 32 ký tự');
  return s;
}

function sign(body: string): string {
  return createHmac('sha256', secret()).update(body).digest('base64url');
}

export function createSession(pid: string, role: Role) {
  const payload: SessionPayload = { pid, role, exp: Date.now() + SIX_HOURS_MS };
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return { token: `${body}.${sign(body)}`, maxAge: SIX_HOURS_MS / 1000 };
}

export function readSession(token: string | undefined): SessionPayload | null {
  if (!token) return null;
  const [body, sig] = token.split('.');
  if (!body || !sig) return null;
  const a = Buffer.from(sig);
  const b = Buffer.from(sign(body));
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const p = JSON.parse(Buffer.from(body, 'base64url').toString()) as SessionPayload;
    return p.exp > Date.now() ? p : null;
  } catch {
    return null;
  }
}
