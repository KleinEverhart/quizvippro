import { NextResponse } from 'next/server';
import { adminSession } from '@/lib/auth';
import { db } from '@/lib/db';
import { fail } from '@/lib/http';

type VRow = {
  participant_id: string;
  kind: string;
  action: string;
  occurred_at: string;
  participants: { full_name: string; mssv: string } | null;
};

export async function GET() {
  if (!adminSession()) return fail(401, 'UNAUTHORIZED');
  const sb = db();

  // Tự động chuyển các câu đã hết giờ trước khi thống kê
  await sb.rpc('settle_all');

  const [exam, students, attempts, violations] = await Promise.all([
    sb.from('exam').select('status, started_at').eq('id', 1).single(),
    sb.from('participants').select('id, full_name, mssv, last_seen, voided_reason').eq('role', 'student').order('joined_at'),
    sb.from('attempts').select('participant_id, status, current_position, finished_at, correct_count, score'),
    sb
      .from('violations')
      .select('participant_id, kind, action, occurred_at, participants(full_name, mssv)')
      .order('occurred_at', { ascending: false }),
  ]);

  const ex = exam.data!;
  const startedMs = ex.started_at ? new Date(ex.started_at).getTime() : 0;
  const now = Date.now();
  const people = students.data ?? [];
  const atts = attempts.data ?? [];
  const vrows = (violations.data ?? []) as unknown as VRow[];
  const online = (iso: string) => new Date(iso).getTime() > now - 45_000;

  const attBy = new Map(atts.map((a) => [a.participant_id, a]));
  const counted = new Map<string, number>();
  for (const v of vrows) {
    if (v.action !== 'INFO') counted.set(v.participant_id, (counted.get(v.participant_id) ?? 0) + 1);
  }

  const rows = people.map((p) => {
    const a = attBy.get(p.id);
    const warnings = counted.get(p.id) ?? 0;
    let status = ex.status === 'WAITING' ? 'Đang chờ' : 'Không tham gia';
    if (a?.status === 'COMPLETED') status = 'Đã hoàn thành';
    else if (a?.status === 'DISQUALIFIED') status = 'Đã bị loại';
    else if (a?.status === 'RUNNING') status = warnings > 0 ? 'Bị cảnh cáo' : 'Đang làm bài';
    if (p.voided_reason) status = 'Đã hủy kết quả';
    const progress = !a ? 0 : a.status === 'COMPLETED' ? 20 : Math.min(20, a.current_position - 1);
    const seconds =
      a?.finished_at && startedMs ? Math.round((new Date(a.finished_at).getTime() - startedMs) / 1000) : null;
    return {
      id: p.id,
      name: p.full_name,
      mssv: p.mssv,
      online: online(p.last_seen),
      status,
      progress,
      seconds,
      correct: a?.correct_count ?? null,
      warnings,
    };
  });

  const byId = new Map(people.map((p) => [p.id, p]));
  const ranking = atts
    .filter((a) => a.status === 'COMPLETED' && a.finished_at && !byId.get(a.participant_id)?.voided_reason)
    .map((a) => {
      const p = byId.get(a.participant_id);
      const finishedMs = new Date(a.finished_at).getTime();
      return {
        name: p?.full_name ?? '—',
        mssv: p?.mssv ?? '—',
        score: a.score as number,
        seconds: Math.round((finishedMs - startedMs) / 1000),
        finishedMs,
      };
    })
    .sort((x, y) => y.score - x.score || x.seconds - y.seconds || x.finishedMs - y.finishedMs)
    .slice(0, 100)
    .map((r, i) => ({ rank: i + 1, name: r.name, mssv: r.mssv, score: r.score, seconds: r.seconds }));

  const connected = rows.filter((r) => r.online).length;
  const stats = {
    loggedIn: rows.length,
    connected,
    waiting: ex.status === 'WAITING' ? connected : 0,
    doing: atts.filter((a) => a.status === 'RUNNING').length,
    completed: atts.filter((a) => a.status === 'COMPLETED').length,
    disqualified: atts.filter((a) => a.status === 'DISQUALIFIED').length,
    violated: rows.filter((r) => r.warnings > 0).length,
  };

  return NextResponse.json({
    exam: { status: ex.status, startedAt: ex.started_at },
    stats,
    participants: rows,
    violations: vrows.slice(0, 200).map((v) => ({
      name: v.participants?.full_name ?? '—',
      mssv: v.participants?.mssv ?? '—',
      kind: v.kind,
      action: v.action,
      at: v.occurred_at,
    })),
    ranking,
  });
}
