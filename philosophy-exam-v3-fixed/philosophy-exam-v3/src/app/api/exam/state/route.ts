import { NextResponse } from 'next/server';
import { studentSession } from '@/lib/auth';
import { attemptIdFor } from '@/lib/attempt';
import { db } from '@/lib/db';
import { fail } from '@/lib/http';
import { SECONDS_PER_QUESTION } from '@/lib/rules';

const LETTERS = ['A', 'B', 'C', 'D'];
const SECONDS_MS = SECONDS_PER_QUESTION * 1000;

export async function GET() {
  const s = studentSession();
  if (!s) return fail(401, 'UNAUTHORIZED');
  const sb = db();

  const { data: me } = await sb.from('participants').select('voided_reason').eq('id', s.pid).maybeSingle();
  if (me?.voided_reason) return NextResponse.json({ phase: 'VOID' });

  const { data: exam } = await sb.from('exam').select('status').eq('id', 1).single();
  if (exam?.status === 'WAITING') return NextResponse.json({ phase: 'WAITING' });
  if (exam?.status === 'ENDED') return NextResponse.json({ phase: 'ENDED' });

  const attId = await attemptIdFor(s.pid);
  if (!attId) return NextResponse.json({ phase: 'NO_ATTEMPT' });

  await sb.rpc('settle_attempt', { p_attempt: attId });

  const { data: a } = await sb
    .from('attempts')
    .select('id, status, current_position, question_started_at')
    .eq('id', attId)
    .single();
  if (!a) return fail(404, 'NOT_FOUND');
  if (a.status === 'COMPLETED') return NextResponse.json({ phase: 'COMPLETED' });
  if (a.status === 'DISQUALIFIED') return NextResponse.json({ phase: 'DISQUALIFIED' });

  const { data: aq } = await sb
    .from('attempt_questions')
    .select('option_order, selected_display, is_correct, points, answered_at, questions(question, options, answer)')
    .eq('attempt_id', a.id)
    .eq('position', a.current_position)
    .single();
  if (!aq) return fail(500, 'Thiếu dữ liệu câu hỏi.');

  // Đáp án đúng chỉ được gửi sau khi thí sinh đã trả lời câu này
  const q = aq.questions as unknown as { question: string; options: { key: string; text: string }[]; answer: string };
  const order = aq.option_order as string[];
  const options = order.map((orig, i) => ({
    key: LETTERS[i],
    text: q.options.find((o) => o.key === orig)?.text ?? '',
  }));
  const answered = aq.answered_at !== null;
  const remainingMs = answered
    ? 0
    : Math.max(0, new Date(a.question_started_at!).getTime() + SECONDS_MS - Date.now());

  const { count } = await sb
    .from('violations')
    .select('id', { count: 'exact', head: true })
    .eq('participant_id', s.pid)
    .neq('action', 'INFO');

  return NextResponse.json({
    phase: 'EXAM',
    position: a.current_position,
    total: 20,
    question: q.question,
    options,
    remainingMs,
    feedback: answered
      ? {
          selected: aq.selected_display,
          correct: LETTERS[order.indexOf(q.answer)],
          isCorrect: aq.is_correct,
          points: aq.points,
        }
      : null,
    warnings: count ?? 0,
  });
}
