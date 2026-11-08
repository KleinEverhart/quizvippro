import { NextResponse } from 'next/server';
import { adminSession } from '@/lib/auth';
import { db } from '@/lib/db';
import { fail } from '@/lib/http';
import { poke } from '@/lib/poke';

export async function POST() {
  if (!adminSession()) return fail(401, 'UNAUTHORIZED');

  const { data, error } = await db().rpc('start_exam');
  if (error) {
    if (error.message.includes('EXAM_NOT_WAITING')) return fail(409, 'Kỳ thi đã bắt đầu rồi.');
    if (error.message.includes('QUESTIONS_NOT_READY')) return fail(409, 'Ngân hàng câu hỏi chưa đủ 20 câu.');
    return fail(500, 'Không thể bắt đầu kỳ thi. Vui lòng thử lại.');
  }

  await poke();
  return NextResponse.json({ ok: true, started: data });
}
