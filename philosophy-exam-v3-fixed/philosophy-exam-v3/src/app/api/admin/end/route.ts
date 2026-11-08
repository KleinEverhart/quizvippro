import { NextResponse } from 'next/server';
import { adminSession } from '@/lib/auth';
import { db } from '@/lib/db';
import { fail } from '@/lib/http';
import { poke } from '@/lib/poke';

export async function POST() {
  if (!adminSession()) return fail(401, 'UNAUTHORIZED');

  const { data, error } = await db().rpc('end_exam');
  if (error) {
    if (error.message.includes('EXAM_NOT_RUNNING')) return fail(409, 'Kỳ thi chưa diễn ra hoặc đã kết thúc.');
    console.error('end_exam failed:', error);
    return fail(500, 'Không thể dừng kỳ thi. Kiểm tra đã chạy migration_v2 chưa.');
  }

  await poke();
  return NextResponse.json({ ok: true, ended: data });
}
