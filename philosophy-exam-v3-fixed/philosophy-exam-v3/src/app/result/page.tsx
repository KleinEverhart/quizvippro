'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

type Review = {
  position: number;
  question: string;
  options: { key: string; text: string }[];
  selected: string | null;
  correct: string;
  status: 'wrong' | 'unanswered';
};

type Result =
  | { phase: 'WAITING' | 'RUNNING' | 'NO_ATTEMPT' }
  | { phase: 'DISQUALIFIED'; fullName: string; mssv: string }
  | { phase: 'VOID'; fullName: string; mssv: string; reason: string }
  | {
      phase: 'COMPLETED';
      fullName: string;
      mssv: string;
      total: number;
      maxScore: number;
      score: number;
      correct: number;
      wrong: number;
      unanswered: number;
      durationSec: number | null;
      review: Review[];
    };

const fmt = (s: number | null) => (s === null ? '—' : `${Math.floor(s / 60)} phút ${s % 60} giây`);

export default function ResultPage() {
  const router = useRouter();
  const [data, setData] = useState<Result | null>(null);

  useEffect(() => {
    fetch('/api/result', { cache: 'no-store' })
      .then(async (r) => {
        if (r.status === 401) return router.replace('/');
        const d: Result = await r.json();
        if (d.phase === 'WAITING') return router.replace('/room');
        if (d.phase === 'RUNNING') return router.replace('/exam');
        setData(d);
      })
      .catch(() => {});
  }, [router]);

  if (!data) {
    return <main className="grid min-h-screen place-items-center text-slate-400">Đang tải kết quả…</main>;
  }

  if (data.phase === 'NO_ATTEMPT') {
    return (
      <main className="grid min-h-screen place-items-center px-4">
        <div className="glass max-w-md p-8 text-center">
          <h1 className="text-xl font-bold">Không có bài thi</h1>
          <p className="mt-3 text-slate-400">Bạn không có bài thi trong kỳ thi này.</p>
        </div>
      </main>
    );
  }

  if (data.phase === 'VOID') {
    return (
      <main className="grid min-h-screen place-items-center px-4">
        <div className="glass max-w-lg border-rose-500/40 p-8 text-center">
          <p className="text-xs tracking-[0.3em] text-rose-300">{data.fullName} · MSSV {data.mssv}</p>
          <h1 className="mt-4 text-xl font-extrabold text-rose-200 md:text-2xl">KẾT QUẢ CỦA BẠN ĐÃ BỊ HỦY</h1>
          <p className="mt-4 text-sm text-slate-400">Lý do: {data.reason}.</p>
        </div>
      </main>
    );
  }

  if (data.phase === 'DISQUALIFIED') {
    return (
      <main className="grid min-h-screen place-items-center px-4">
        <div className="glass max-w-lg border-rose-500/40 p-8 text-center">
          <p className="text-xs tracking-[0.3em] text-rose-300">{data.fullName} · MSSV {data.mssv}</p>
          <h1 className="mt-4 text-xl font-extrabold leading-relaxed text-rose-200 md:text-2xl">
            BẠN ĐÃ BỊ LOẠI KHỎI KỲ THI DO VI PHẠM QUY ĐỊNH.
          </h1>
          <p className="mt-4 text-sm text-slate-400">Vui lòng liên hệ quản trị viên nếu có thắc mắc.</p>
        </div>
      </main>
    );
  }

  if (data.phase !== 'COMPLETED') return null;

  return (
    <main className="mx-auto min-h-screen max-w-4xl px-4 py-8">
      <section className="glass mb-6 p-6 md:p-8">
        <p className="text-xs tracking-[0.3em] text-sky-300/80">PHILOSOPHY EXAM · KẾT QUẢ</p>
        <h1 className="mt-2 text-2xl font-bold md:text-3xl">{data.fullName}</h1>
        <p className="text-sm text-slate-400">MSSV {data.mssv}</p>
        <p className="mt-4 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-emerald-200">
          Bạn đã hoàn thành bài thi.
        </p>

        <div className="mt-6 grid grid-cols-2 gap-4 md:grid-cols-4">
          {[
            ['Tổng điểm', `${data.score} / ${data.maxScore}`],
            ['Câu đúng', `${data.correct} / ${data.total}`],
            ['Câu sai', data.wrong],
            ['Chưa trả lời', data.unanswered],
          ].map(([label, value]) => (
            <div key={String(label)} className="rounded-xl bg-slate-900/60 p-4 text-center">
              <p className="text-xs text-slate-400">{label}</p>
              <p className="mt-1 text-2xl font-bold tabular-nums">{value}</p>
            </div>
          ))}
        </div>
        <p className="mt-4 text-sm text-slate-400">Thời gian hoàn thành: {fmt(data.durationSec)}</p>
      </section>

      {data.review.length > 0 && (
        <section className="space-y-4">
          <h2 className="px-1 text-lg font-semibold">Xem lại các câu sai hoặc bỏ trống</h2>
          {data.review.map((r) => (
            <article key={r.position} className="glass p-5">
              <p className="mb-3 text-xs text-slate-400">
                Câu {r.position} ·{' '}
                <span className={r.status === 'wrong' ? 'text-rose-300' : 'text-amber-300'}>
                  {r.status === 'wrong' ? 'Sai' : 'Chưa trả lời'}
                </span>
              </p>
              <h3 className="mb-4 font-medium leading-relaxed">{r.question}</h3>
              <div className="grid gap-2 md:grid-cols-2">
                {r.options.map((o) => {
                  const isCorrect = o.key === r.correct;
                  const isSelected = o.key === r.selected;
                  const cls = isCorrect
                    ? 'border-emerald-400 bg-emerald-500/15 text-emerald-100'
                    : isSelected
                      ? 'border-rose-500 bg-rose-500/15 text-rose-100'
                      : 'border-slate-700/60 bg-slate-900/40 text-slate-300';
                  return (
                    <div key={o.key} className={`rounded-xl border px-4 py-2.5 text-sm ${cls}`}>
                      <b className="mr-2">{o.key}.</b>
                      {o.text}
                      {isCorrect && <span className="ml-2 text-xs">(đáp án đúng)</span>}
                      {isSelected && !isCorrect && <span className="ml-2 text-xs">(bạn đã chọn)</span>}
                    </div>
                  );
                })}
              </div>
            </article>
          ))}
        </section>
      )}
    </main>
  );
}
