import { NextResponse } from 'next/server';
import { adminSession } from '@/lib/auth';
import { db } from '@/lib/db';
import { fail } from '@/lib/http';
import { poke } from '@/lib/poke';

export async function POST(req: Request) {
  if (!adminSession()) return fail(401, 'UNAUTHORIZED');

  const body = await req.json().catch(() => null);
  if (body?.confirm !== 'RESET') return fail(400, 'Cần xác nhận bằng chữ RESET.');

  const { error } = await db().rpc('reset_exam');
  if (error) {
    console.error('reset_exam failed:', error);
    return fail(500, 'Không thể reset kỳ thi. Kiểm tra đã chạy migration_v2 và migration_v4 chưa.');
  }

  await poke();
  return NextResponse.json({ ok: true });
}
