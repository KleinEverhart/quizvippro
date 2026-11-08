'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { SECONDS_PER_QUESTION } from '@/lib/rules';

type Feedback = { selected: string | null; correct: string; isCorrect: boolean; points: number };
type ExamState =
  | { phase: 'WAITING' | 'NO_ATTEMPT' | 'COMPLETED' | 'DISQUALIFIED' | 'ENDED' | 'VOID' }
  | {
      phase: 'EXAM';
      position: number;
      total: number;
      question: string;
      options: { key: string; text: string }[];
      remainingMs: number;
      feedback: Feedback | null;
      warnings: number;
    };

function optionClass(key: string, fb: Feedback | null): string {
  const base =
    'flex w-full items-center rounded-2xl border px-4 py-4 text-left transition-all duration-300 disabled:cursor-not-allowed ';
  if (!fb) {
    return (
      base +
      'border-slate-600/60 bg-slate-900/60 hover:-translate-y-0.5 hover:border-sky-400 hover:bg-slate-800/80 active:scale-[0.99]'
    );
  }
  if (key === fb.correct) {
    return base + 'border-emerald-400 bg-emerald-500/20 text-emerald-50 shadow-[0_0_25px_-5px_rgba(52,211,153,0.6)]';
  }
  if (key === fb.selected) return base + 'border-rose-500 bg-rose-500/20 text-rose-50';
  return base + 'border-slate-700/50 bg-slate-900/40 opacity-50';
}

export default function ExamPage() {
  const router = useRouter();
  const [st, setSt] = useState<ExamState | null>(null);
  const [deadline, setDeadline] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  const [who, setWho] = useState<{ fullName: string; mssv: string } | null>(null);
  const [notice, setNotice] = useState('');
  const [offline, setOffline] = useState(false);
  const busyRef = useRef(false);
  const phaseRef = useRef<string | null>(null);
  const timeoutPosRef = useRef<number | null>(null);

  const fetchState = useCallback(async () => {
    try {
      const r = await fetch('/api/exam/state', { cache: 'no-store' });
      if (r.status === 401) {
        router.replace('/');
        return;
      }
      const d = (await r.json()) as ExamState;
      setOffline(false);
      if (d.phase === 'WAITING') {
        router.replace('/room');
        return;
      }
      setSt(d);
      if (d.phase === 'EXAM') setDeadline(Date.now() + d.remainingMs);
      else router.replace('/result');
    } catch {
      setOffline(true);
    }
  }, [router]);

  // Kiểm tra phiên, tải trạng thái ban đầu, và làm mới định kỳ (dự phòng cho realtime)
  useEffect(() => {
    fetch('/api/session', { cache: 'no-store' })
      .then((r) => r.json())
      .then((d) => {
        if (!d.authenticated) return router.replace('/');
        if (d.role === 'student') setWho({ fullName: d.fullName, mssv: d.mssv });
        if (d.redirect !== '/exam') router.replace(d.redirect);
      })
      .catch(() => {});
    fetchState();
    const poll = setInterval(fetchState, 4000);
    const tick = setInterval(() => setNow(Date.now()), 250);
    return () => {
      clearInterval(poll);
      clearInterval(tick);
    };
  }, [fetchState, router]);

  useEffect(() => {
    phaseRef.current = st?.phase ?? null;
  }, [st]);

  // Sau khi xem đúng/sai, tự chuyển sang câu tiếp theo
  const feedbackPos = st?.phase === 'EXAM' && st.feedback ? st.position : null;
  useEffect(() => {
    if (feedbackPos === null) return;
    const t = setTimeout(async () => {
      await fetch('/api/exam/next', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ position: feedbackPos }),
      }).catch(() => {});
      fetchState();
    }, 2500);
    return () => clearTimeout(t);
  }, [feedbackPos, fetchState]);

  // Khi hết 30 giây, nhờ máy chủ chuyển câu (máy chủ là nguồn thời gian chính thức)
  const remaining = st?.phase === 'EXAM' && !st.feedback ? Math.max(0, deadline - now) : null;
  useEffect(() => {
    if (st?.phase !== 'EXAM' || st.feedback || remaining !== 0) return;
    if (timeoutPosRef.current === st.position) return;
    timeoutPosRef.current = st.position;
    setTimeout(fetchState, 400);
  }, [remaining, st, fetchState]);

  // Theo dõi hành vi rời trang. Mỗi lần rời chỉ gửi một sự kiện.
  useEffect(() => {
    let away = false;
    let offlineAt = 0;

    const send = (kind: string) =>
      fetch('/api/exam/violation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind }),
        keepalive: true,
      })
        .then((r) => r.json())
        .then((d) => {
          if (d.action === 'WARNING') {
            setNotice('Cảnh cáo: bạn vừa rời khỏi trang thi. Vi phạm thêm một lần nữa sẽ bị loại.');
          }
          if (d.action === 'DISQUALIFIED') fetchState();
        })
        .catch(() => {});

    const report = (kind: string) => {
      if (away || phaseRef.current !== 'EXAM') return;
      away = true;
      send(kind);
    };
    const onVisibility = () => {
      if (document.hidden) report('tab_hidden');
      else away = false;
    };
    const onBlur = () => report('window_blur');
    const onFocus = () => {
      if (!document.hidden) away = false;
    };
    const onPageHide = () => {
      if (phaseRef.current === 'EXAM') {
        navigator.sendBeacon(
          '/api/exam/violation',
          new Blob([JSON.stringify({ kind: 'page_leave' })], { type: 'application/json' })
        );
      }
    };
    const onOffline = () => {
      offlineAt = Date.now();
      setOffline(true);
    };
    const onOnline = () => {
      setOffline(false);
      if (offlineAt && phaseRef.current === 'EXAM') {
        send('connection_lost');
        offlineAt = 0;
      }
    };

    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('blur', onBlur);
    window.addEventListener('focus', onFocus);
    window.addEventListener('pagehide', onPageHide);
    window.addEventListener('offline', onOffline);
    window.addEventListener('online', onOnline);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('blur', onBlur);
      window.removeEventListener('focus', onFocus);
      window.removeEventListener('pagehide', onPageHide);
      window.removeEventListener('offline', onOffline);
      window.removeEventListener('online', onOnline);
    };
  }, [fetchState]);

  async function answer(choice: string) {
    if (!st || st.phase !== 'EXAM' || st.feedback || busyRef.current) return;
    busyRef.current = true;
    try {
      const r = await fetch('/api/exam/answer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ position: st.position, choice }),
      });
      if (!r.ok) setNotice((await r.json()).error ?? 'Không ghi nhận được đáp án.');
    } catch {
      setNotice('Mất kết nối, đáp án chưa được ghi nhận. Vui lòng chọn lại.');
    } finally {
      busyRef.current = false;
      fetchState();
    }
  }

  if (!st || st.phase !== 'EXAM') {
    return (
      <main className="grid min-h-screen place-items-center">
        <div className="text-center">
          <div className="mx-auto mb-4 h-10 w-10 animate-spin rounded-full border-4 border-sky-400 border-t-transparent" />
          <p className="text-slate-300">{offline ? 'Mất kết nối, đang thử lại…' : 'Đang tải bài thi…'}</p>
        </div>
      </main>
    );
  }

  const fb = st.feedback;
  const secs = Math.ceil((remaining ?? 0) / 1000);
  const danger = remaining !== null && remaining <= 10_000;
  const timedOut = remaining === 0 && !fb;
  const pct = ((st.position - 1) / st.total) * 100;

  return (
    <main className="mx-auto min-h-screen max-w-4xl px-4 py-6">
      <header className="glass mb-4 flex flex-wrap items-center justify-between gap-3 p-4">
        <div>
          <p className="text-xs uppercase tracking-[0.25em] text-sky-300/80">PHILOSOPHY EXAM</p>
          <p className="font-semibold">
            {who?.fullName ?? '…'}{' '}
            <span className="text-sm font-normal text-slate-400">· MSSV {who?.mssv ?? '…'}</span>
          </p>
        </div>
        <div className="text-sm text-slate-300">
          Câu <b className="text-white">{st.position}</b> / {st.total}
        </div>
      </header>

      <div className="mb-5 h-2.5 overflow-hidden rounded-full bg-slate-800">
        <div
          className="h-full rounded-full bg-gradient-to-r from-electric to-cyan-400 transition-all duration-500"
          style={{ width: `${pct}%` }}
        />
      </div>

      {notice && (
        <div className="mb-4 rounded-xl border border-amber-400/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
          {notice}
        </div>
      )}
      {st.warnings > 0 && (
        <div className="mb-4 rounded-xl border border-rose-500/40 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">
          Bạn đã bị cảnh cáo {st.warnings} lần. Vi phạm thêm sẽ bị loại khỏi kỳ thi.
        </div>
      )}
      {offline && (
        <div className="mb-4 rounded-xl border border-slate-600 bg-slate-800/60 px-4 py-3 text-sm text-slate-300">
          Mất kết nối. Thời gian vẫn được tính theo máy chủ, hãy kiểm tra mạng.
        </div>
      )}

      <section className="glass msg-in p-6 md:p-8">
        <div className="mb-6 flex items-start justify-between gap-4">
          <h2 className="text-lg font-semibold leading-relaxed md:text-xl">{st.question}</h2>
          <div
            className={`grid h-20 w-20 shrink-0 place-items-center rounded-full border-4 text-2xl font-bold tabular-nums transition-colors ${
              danger ? 'timer-danger border-rose-500 text-rose-300' : 'border-sky-400 text-sky-200'
            }`}
          >
            {fb ? '—' : secs}
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          {st.options.map((o) => (
            <button
              key={o.key}
              disabled={!!fb || timedOut}
              onClick={() => answer(o.key)}
              className={optionClass(o.key, fb)}
            >
              <span className="mr-3 grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-slate-800 text-sm font-bold">
                {o.key}
              </span>
              <span className="text-left">{o.text}</span>
            </button>
          ))}
        </div>

        {fb && (
          <div
            className={`msg-in mt-6 rounded-xl px-4 py-3 text-center text-lg font-extrabold tracking-widest ${
              fb.isCorrect ? 'bg-emerald-500/15 text-emerald-300' : 'bg-rose-500/15 text-rose-300'
            }`}
          >
            {fb.isCorrect ? `ĐÚNG · +${fb.points} điểm` : 'SAI · 0 điểm'}
          </div>
        )}
        {timedOut && (
          <p className="mt-6 text-center text-sm text-amber-300">Hết giờ, đang chuyển sang câu tiếp theo…</p>
        )}
        {!fb && !timedOut && (
          <p className="mt-6 text-center text-xs text-slate-500">
            Mỗi câu {SECONDS_PER_QUESTION} giây. Trả lời đúng được điểm bằng số giây còn lại. Đáp án đã chọn không thể thay đổi.
          </p>
        )}
      </section>
    </main>
  );
}
