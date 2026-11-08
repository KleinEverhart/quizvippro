import { cookies } from 'next/headers';
import { readSession, SESSION_COOKIE, type SessionPayload } from './session';

export function getSession(): SessionPayload | null {
  return readSession(cookies().get(SESSION_COOKIE)?.value);
}

export function studentSession(): SessionPayload | null {
  const s = getSession();
  return s?.role === 'student' ? s : null;
}

export function adminSession(): SessionPayload | null {
  const s = getSession();
  return s?.role === 'admin' ? s : null;
}
