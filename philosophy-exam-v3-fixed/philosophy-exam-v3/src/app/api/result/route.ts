import { NextResponse } from 'next/server';
import { studentSession } from '@/lib/auth';
import { db } from '@/lib/db';
import { fail } from '@/lib/http';
import { MAX_SCORE } from '@/lib/rules';

const LETTERS = ['A', 'B', 'C', 'D'];

type Q = { question: string; options: { key: string; text: string }[]; answer: string };

export async function GET() {
  const s = studentSession();
  if (!s) return fail(401, 'UNAUTHORIZED');
  const sb = db();

  const { data: p } = await sb
    .from('participants')
    .select('full_name, mssv, voided_reason')
    .eq('id', s.pid)
    .maybeSingle();
  if (!p) return fail(401, 'UNAUTHORIZED');
  if (p.voided_reason) {
    return NextResponse.json({ phase: 'VOID', fullName: p.full_name, mssv: p.mssv, reason: p.voided_reason });
  }

  const { data: exam } = await sb.from('exam').select('status, started_at').eq('id', 1).single();
  if (exam?.status === 'WAITING') return NextResponse.json({ phase: 'WAITING' });

  const { data: a } = await sb
    .from('attempts')
    .select('id, status, finished_at, score')
    .eq('participant_id', s.pid)
    .maybeSingle();

  if (!a) return NextResponse.json({ phase: 'NO_ATTEMPT' });
  if (a.status === 'RUNNING') return NextResponse.json({ phase: 'RUNNING' });
  if (a.status === 'DISQUALIFIED') {
    return NextResponse.json({ phase: 'DISQUALIFIED', fullName: p.full_name, mssv: p.mssv });
  }

  const { data: rows } = await sb
    .from('attempt_questions')
    .select('position, option_order, selected_display, is_correct, questions(question, options, answer)')
    .eq('attempt_id', a.id)
    .order('position');

  let correct = 0;
  let wrong = 0;
  let unanswered = 0;
  const review: unknown[] = [];

  for (const r of rows ?? []) {
    const q = r.questions as unknown as Q;
    const order = r.option_order as string[];
    const status = r.is_correct ? 'correct' : r.selected_display ? 'wrong' : 'unanswered';
    if (status === 'correct') correct++;
    if (status === 'wrong') wrong++;
    if (status === 'unanswered') unanswered++;
    // Chỉ hiển thị câu sai hoặc bỏ trống để xem lại
    if (status !== 'correct') {
      review.push({
        position: r.position,
        question: q.question,
        options: order.map((orig, i) => ({
          key: LETTERS[i],
          text: q.options.find((o) => o.key === orig)?.text ?? '',
        })),
        selected: r.selected_display,
        correct: LETTERS[order.indexOf(q.answer)],
        status,
      });
    }
  }

  const durationSec =
    a.finished_at && exam?.started_at
      ? Math.round((new Date(a.finished_at).getTime() - new Date(exam.started_at).getTime()) / 1000)
      : null;

  return NextResponse.json({
    phase: 'COMPLETED',
    fullName: p.full_name,
    mssv: p.mssv,
    total: 20,
    maxScore: MAX_SCORE,
    score: a.score,
    correct,
    wrong,
    unanswered,
    durationSec,
    review,
  });
}
