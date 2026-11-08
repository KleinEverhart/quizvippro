import { NextResponse } from 'next/server';
import { studentSession } from '@/lib/auth';
import { attemptIdFor } from '@/lib/attempt';
import { db } from '@/lib/db';
import { fail } from '@/lib/http';

const REASONS: Record<string, string> = {
  NOT_CURRENT: 'Câu hỏi đã hết thời gian hoặc đã được chuyển.',
  ALREADY_ANSWERED: 'Bạn đã trả lời câu này rồi.',
  BAD_CHOICE: 'Đáp án không hợp lệ.',
};

export async function POST(req: Request) {
  const s = studentSession();
  if (!s) return fail(401, 'UNAUTHORIZED');

  const body = await req.json().catch(() => null);
  const position = Number(body?.position);
  const choice = String(body?.choice ?? '');
  if (!Number.isInteger(position) || position < 1 || position > 20 || !['A', 'B', 'C', 'D'].includes(choice)) {
    return fail(400, 'Dữ liệu không hợp lệ.');
  }

  const attId = await attemptIdFor(s.pid);
  if (!attId) return fail(404, 'Không tìm thấy bài thi.');

  const { data, error } = await db().rpc('submit_answer', {
    p_attempt: attId,
    p_pos: position,
    p_choice: choice,
  });
  if (error) return fail(500, 'Không ghi nhận được đáp án.');
  if (!data?.ok) return fail(409, REASONS[data?.reason] ?? 'Không ghi nhận được đáp án.');
  return NextResponse.json({ ok: true });
}
