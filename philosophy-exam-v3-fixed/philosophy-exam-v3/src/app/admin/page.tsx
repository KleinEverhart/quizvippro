'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { onPoke } from '@/lib/realtime';
import { MAX_SCORE } from '@/lib/rules';

type Row = {
  id: string;
  name: string;
  mssv: string;
  online: boolean;
  status: string;
  progress: number;
  seconds: number | null;
  correct: number | null;
  warnings: number;
};
type Viol = { name: string; mssv: string; kind: string; action: string; at: string };
type Rank = { rank: number; name: string; mssv: string; score: number; seconds: number };
type Dashboard = {
  exam: { status: 'WAITING' | 'RUNNING' | 'ENDED'; startedAt: string | null };
  stats: {
    loggedIn: number;
    connected: number;
    waiting: number;
    doing: number;
    completed: number;
    disqualified: number;
    violated: number;
  };
  participants: Row[];
  violations: Viol[];
  ranking: Rank[];
};

const KIND_LABEL: Record<string, string> = {
  tab_hidden: 'Chuyển sang tab khác / ẩn tab',
  window_blur: 'Chuyển sang cửa sổ khác',
  page_leave: 'Rời khỏi trang thi',
  connection_lost: 'Mất kết nối bất thường',
};
const ACTION_LABEL: Record<string, string> = {
  WARNING: 'Cảnh cáo',
  DISQUALIFIED: 'Loại khỏi kỳ thi',
  INFO: 'Ghi nhận (không tính vi phạm)',
};
const STATUS_STYLE: Record<string, string> = {
  'Đang chờ': 'bg-slate-600/40 text-slate-200',
  'Đang làm bài': 'bg-sky-500/20 text-sky-200',
  'Bị cảnh cáo': 'bg-amber-500/20 text-amber-200',
  'Đã hoàn thành': 'bg-emerald-500/20 text-emerald-200',
  'Đã bị loại': 'bg-rose-500/20 text-rose-200',
  'Không tham gia': 'bg-slate-700/40 text-slate-400',
  'Đã hủy kết quả': 'bg-rose-900/40 text-rose-300',
};

const fmtTime = (s: number | null) => (s === null ? '—' : `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`);
const fmtClock = (iso: string) => new Date(iso).toLocaleTimeString('vi-VN');

function rankStyle(rank: number): string {
  if (rank === 1) {
    return 'border-yellow-300 bg-gradient-to-r from-yellow-400/30 via-amber-300/10 to-yellow-500/30 shadow-[0_0_30px_-5px_rgba(250,204,21,0.6)]';
  }
  if (rank === 2) return 'border-slate-200/70 bg-gradient-to-r from-slate-300/25 to-slate-400/10';
  if (rank === 3) return 'border-orange-500/70 bg-gradient-to-r from-orange-700/30 to-orange-900/10';
  if (rank <= 10) return 'border-sky-500/50 bg-sky-500/10';
  return 'border-slate-700/50 bg-slate-900/40';
}

export default function AdminPage() {
  const router = useRouter();
  const [data, setData] = useState<Dashboard | null>(null);
  const [starting, setStarting] = useState(false);
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const r = await fetch('/api/admin/dashboard', { cache: 'no-store' });
      if (r.status === 401) return router.replace('/');
      if (r.ok) setData(await r.json());
    } catch {
      /* thử lại ở lần sau */
    }
  }, [router]);

  useEffect(() => {
    load();
    const timer = setInterval(load, 3000);
    const off = onPoke(load);
    return () => {
      clearInterval(timer);
      off();
    };
  }, [load]);

  async function start() {
    if (!window.confirm('Bắt đầu kỳ thi ngay? Toàn bộ thí sinh sẽ được đưa vào bài thi.')) return;
    setStarting(true);
    setMsg('');
    try {
      const r = await fetch('/api/admin/start', { method: 'POST' });
      const d = await r.json();
      if (!r.ok) setMsg(d.error ?? 'Không thể bắt đầu kỳ thi.');
      else setMsg(`Đã bắt đầu kỳ thi cho ${d.started} thí sinh.`);
    } catch {
      setMsg('Mất kết nối máy chủ.');
    } finally {
      setStarting(false);
      load();
    }
  }

  async function endExam() {
    if (!window.confirm('Dừng kỳ thi ngay? Bài đang làm sẽ được chốt, câu chưa trả lời tính là bỏ trống.')) return;
    setBusy(true);
    setMsg('');
    try {
      const r = await fetch('/api/admin/end', { method: 'POST' });
      const d = await r.json();
      setMsg(r.ok ? `Đã dừng kỳ thi. ${d.ended} bài đang làm đã được chốt.` : d.error);
    } catch {
      setMsg('Mất kết nối máy chủ.');
    } finally {
      setBusy(false);
      load();
    }
  }

  async function resetExam() {
    const typed = window.prompt(
      'RESET sẽ XÓA TOÀN BỘ dữ liệu: thí sinh, bài làm, điểm, bảng xếp hạng, vi phạm, chat và số liệu truy cập; đưa kỳ thi về trạng thái chờ. Không thể khôi phục.\nGõ chữ RESET để xác nhận:'
    );
    if (typed !== 'RESET') return;
    setBusy(true);
    setMsg('');
    try {
      const r = await fetch('/api/admin/reset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirm: typed }),
      });
      const d = await r.json();
      setMsg(r.ok ? 'Đã reset toàn bộ dữ liệu (thí sinh, bảng xếp hạng, truy cập, chat). Thí sinh cần đăng nhập lại.' : d.error);
    } catch {
      setMsg('Mất kết nối máy chủ.');
    } finally {
      setBusy(false);
      load();
    }
  }

  async function logout() {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.replace('/');
  }

  if (!data) {
    return <main className="grid min-h-screen place-items-center text-slate-400">Đang tải bảng điều khiển…</main>;
  }

  const running = data.exam.status === 'RUNNING';
  const ended = data.exam.status === 'ENDED';
  const cards: [string, number][] = [
    ['Đã đăng nhập', data.stats.loggedIn],
    ['Đang ở phòng chờ', data.stats.waiting],
    ['Đang làm bài', data.stats.doing],
    ['Đã hoàn thành', data.stats.completed],
    ['Bị loại', data.stats.disqualified],
    ['Có vi phạm', data.stats.violated],
  ];

  return (
    <main className="mx-auto min-h-screen max-w-6xl space-y-6 px-4 py-6 md:px-8">
      <header className="glass flex flex-wrap items-center justify-between gap-4 p-5">
        <div>
          <p className="text-xs tracking-[0.3em] text-amber-300/80">PHILOSOPHY EXAM · ADMIN</p>
          <h1 className="text-2xl font-bold">Bảng điều khiển</h1>
          <p className="mt-1 text-sm text-slate-400">
            Trạng thái kỳ thi:{' '}
            <span className={running ? 'text-emerald-300' : 'text-amber-300'}>
              {running ? 'ĐANG DIỄN RA' : ended ? 'ĐÃ KẾT THÚC' : 'ĐANG CHỜ'}
            </span>
            {' · '}Đang kết nối: {data.stats.connected}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <button onClick={start} disabled={data.exam.status !== 'WAITING' || starting} className="btn-primary px-8 py-3 text-lg tracking-wider">
            {starting ? 'ĐANG KHỞI ĐỘNG…' : 'START EXAM'}
          </button>
          <button onClick={endExam} disabled={!running || busy} className="rounded-xl border border-amber-500/50 bg-amber-500/10 px-5 py-3 font-semibold text-amber-200 transition hover:bg-amber-500/20 disabled:cursor-not-allowed disabled:opacity-40">DỪNG THI</button>
          <button onClick={resetExam} disabled={busy || running} className="rounded-xl border border-rose-500/50 bg-rose-500/10 px-5 py-3 font-semibold text-rose-200 transition hover:bg-rose-500/20 disabled:cursor-not-allowed disabled:opacity-40">RESET</button>
          <button onClick={logout} className="btn-ghost">Thoát</button>
        </div>
      </header>
      {msg && <p className="text-sm text-sky-200">{msg}</p>}

      <section className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-6">
        {cards.map(([label, value]) => (
          <div key={label} className="glass p-4">
            <p className="text-xs text-slate-400">{label}</p>
            <p className="mt-1 text-3xl font-bold tabular-nums">{value}</p>
          </div>
        ))}
      </section>

      <section className="glass overflow-x-auto p-5">
        <h2 className="mb-4 font-semibold">Theo dõi thí sinh</h2>
        <table className="w-full min-w-[640px] text-sm">
          <thead className="text-left text-xs uppercase tracking-wider text-slate-400">
            <tr>
              <th className="pb-3">STT</th>
              <th className="pb-3">Họ tên</th>
              <th className="pb-3">MSSV</th>
              <th className="pb-3">Trạng thái</th>
              <th className="pb-3">Tiến độ</th>
              <th className="pb-3">Thời gian</th>
            </tr>
          </thead>
          <tbody>
            {data.participants.map((p, i) => (
              <tr key={p.id} className="border-t border-slate-800/80">
                <td className="py-2.5">{i + 1}</td>
                <td className="py-2.5">
                  <span className={`mr-2 inline-block h-2 w-2 rounded-full ${p.online ? 'bg-emerald-400' : 'bg-slate-600'}`} />
                  {p.name}
                </td>
                <td className="py-2.5 tabular-nums text-slate-300">{p.mssv}</td>
                <td className="py-2.5">
                  <span className={`rounded-full px-2.5 py-1 text-xs ${STATUS_STYLE[p.status] ?? ''}`}>{p.status}</span>
                </td>
                <td className="py-2.5">
                  <div className="flex items-center gap-2">
                    <div className="h-1.5 w-24 overflow-hidden rounded-full bg-slate-800">
                      <div className="h-full bg-sky-400" style={{ width: `${(p.progress / 20) * 100}%` }} />
                    </div>
                    <span className="tabular-nums text-slate-400">{p.progress}/20</span>
                  </div>
                </td>
                <td className="py-2.5 tabular-nums">{fmtTime(p.seconds)}</td>
              </tr>
            ))}
            {data.participants.length === 0 && (
              <tr>
                <td colSpan={6} className="py-6 text-center text-slate-500">Chưa có thí sinh nào đăng nhập.</td>
              </tr>
            )}
          </tbody>
        </table>
      </section>

      <section className="glass overflow-x-auto p-5">
        <h2 className="mb-4 font-semibold">VIOLATION MONITOR</h2>
        <table className="w-full min-w-[640px] text-sm">
          <thead className="text-left text-xs uppercase tracking-wider text-slate-400">
            <tr>
              <th className="pb-3">Tên thí sinh</th>
              <th className="pb-3">MSSV</th>
              <th className="pb-3">Loại vi phạm</th>
              <th className="pb-3">Thời điểm</th>
              <th className="pb-3">Xử lý</th>
            </tr>
          </thead>
          <tbody>
            {data.violations.map((v, i) => (
              <tr key={i} className="border-t border-slate-800/80">
                <td className="py-2.5">{v.name}</td>
                <td className="py-2.5 tabular-nums text-slate-300">{v.mssv}</td>
                <td className="py-2.5">{KIND_LABEL[v.kind] ?? v.kind}</td>
                <td className="py-2.5 tabular-nums">{fmtClock(v.at)}</td>
                <td className="py-2.5">
                  <span
                    className={`rounded-full px-2.5 py-1 text-xs ${
                      v.action === 'DISQUALIFIED'
                        ? 'bg-rose-500/20 text-rose-200'
                        : v.action === 'WARNING'
                          ? 'bg-amber-500/20 text-amber-200'
                          : 'bg-slate-700/40 text-slate-300'
                    }`}
                  >
                    {ACTION_LABEL[v.action] ?? v.action}
                  </span>
                </td>
              </tr>
            ))}
            {data.violations.length === 0 && (
              <tr>
                <td colSpan={5} className="py-6 text-center text-slate-500">Chưa ghi nhận vi phạm nào.</td>
              </tr>
            )}
          </tbody>
        </table>
      </section>

      <section className="glass p-5">
        <h2 className="mb-4 font-semibold">Bảng xếp hạng (TOP 100)</h2>
        {data.ranking.length === 0 && (
          <p className="py-6 text-center text-slate-500">Chưa có thí sinh nào hoàn thành bài thi.</p>
        )}
        <ol className="space-y-2">
          {data.ranking.map((r) => (
            <li key={r.mssv + r.rank} className={`flex flex-wrap items-center gap-4 rounded-xl border px-4 py-3 ${rankStyle(r.rank)}`}>
              <span className="w-14 text-center text-lg font-extrabold tabular-nums">
                {r.rank === 1 ? '👑' : `#${r.rank}`}
              </span>
              <span className="min-w-[160px] flex-1 font-semibold">{r.name}</span>
              <span className="tabular-nums text-slate-300">MSSV {r.mssv}</span>
              <span className="tabular-nums">
                Điểm <b className="text-white">{r.score}/{MAX_SCORE}</b>
              </span>
              <span className="tabular-nums text-slate-300">{fmtTime(r.seconds)}</span>
            </li>
          ))}
        </ol>
      </section>
    </main>
  );
}
