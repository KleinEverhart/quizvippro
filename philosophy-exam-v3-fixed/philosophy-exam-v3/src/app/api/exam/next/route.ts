import { NextResponse } from 'next/server';
import { studentSession } from '@/lib/auth';
import { attemptIdFor } from '@/lib/attempt';
import { db } from '@/lib/db';
import { fail } from '@/lib/http';

export async function POST(req: Request) {
  const s = studentSession();
  if (!s) return fail(401, 'UNAUTHORIZED');

  const body = await req.json().catch(() => null);
  const position = Number(body?.position);
  if (!Number.isInteger(position)) return fail(400, 'Dữ liệu không hợp lệ.');

  const attId = await attemptIdFor(s.pid);
  if (!attId) return fail(404, 'Không tìm thấy bài thi.');

  await db().rpc('advance_attempt', { p_attempt: attId, p_pos: position });
  return NextResponse.json({ ok: true });
}
