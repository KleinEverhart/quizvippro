import { NextResponse } from 'next/server';
import { studentSession } from '@/lib/auth';
import { db } from '@/lib/db';
import { fail } from '@/lib/http';
import { poke } from '@/lib/poke';

const KINDS = ['tab_hidden', 'window_blur', 'page_leave', 'connection_lost'];

export async function POST(req: Request) {
  const s = studentSession();
  if (!s) return fail(401, 'UNAUTHORIZED');

  const body = await req.json().catch(() => null);
  const kind = String(body?.kind ?? '');
  if (!KINDS.includes(kind)) return fail(400, 'Loại sự kiện không hợp lệ.');

  const { data, error } = await db().rpc('record_violation', { p_participant: s.pid, p_kind: kind });
  if (error) return fail(500, 'Không ghi nhận được sự kiện.');

  if (data === 'WARNING' || data === 'DISQUALIFIED') await poke();
  return NextResponse.json({ action: data });
}
