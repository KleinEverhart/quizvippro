'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { RULES } from '@/lib/rules';

const SYMBOLS = ['Σ', 'Ω', 'λ', 'φ', '∞', 'ψ', 'Δ', '∴', 'π', '≡'];

export default function LoginPage() {
  const router = useRouter();
  const [fullName, setFullName] = useState('');
  const [mssv, setMssv] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetch('/api/session', { cache: 'no-store' })
      .then((r) => r.json())
      .then((d) => {
        if (d.authenticated) router.replace(d.redirect);
      })
      .catch(() => {});
  }, [router]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fullName, mssv }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? 'Có lỗi xảy ra.');
        setLoading(false);
        return;
      }
      router.replace(data.redirect);
    } catch {
      setError('Không kết nối được máy chủ. Vui lòng thử lại.');
      setLoading(false);
    }
  }

  return (
    <main className="relative grid min-h-screen place-items-center overflow-hidden px-4 py-10">
      {SYMBOLS.map((s, i) => (
        <span
          key={i}
          aria-hidden
          className="float-symbol pointer-events-none absolute select-none font-serif text-5xl text-sky-300/10 md:text-7xl"
          style={{ left: `${(i * 37) % 92}%`, top: `${(i * 53) % 88}%`, animationDelay: `${i * 0.6}s` }}
        >
          {s}
        </span>
      ))}

      <div className="glass msg-in relative w-full max-w-md p-8 md:p-10">
        <p className="text-center text-xs tracking-[0.4em] text-amber-300/80">HỆ THỐNG THI TRẮC NGHIỆM</p>
        <h1 className="mt-3 bg-gradient-to-r from-sky-300 via-white to-amber-300 bg-clip-text text-center text-4xl font-black tracking-tight text-transparent md:text-5xl">
          PHILOSOPHY EXAM
        </h1>
        <p className="mt-3 text-center text-sm text-slate-400">Hệ thống thi trắc nghiệm Triết học trực tuyến</p>

        <form onSubmit={onSubmit} className="mt-8 space-y-5">
          <div>
            <label htmlFor="name" className="mb-1.5 block text-sm text-slate-300">Họ và tên</label>
            <input
              id="name"
              className="input"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              maxLength={60}
              autoComplete="name"
              required
            />
          </div>
          <div>
            <label htmlFor="mssv" className="mb-1.5 block text-sm text-slate-300">Mã số sinh viên (MSSV)</label>
            <input
              id="mssv"
              className="input"
              value={mssv}
              onChange={(e) => setMssv(e.target.value)}
              maxLength={20}
              inputMode="numeric"
              required
            />
          </div>

          {error && (
            <p role="alert" className="rounded-xl border border-rose-500/40 bg-rose-500/10 px-4 py-2.5 text-sm text-rose-200">
              {error}
            </p>
          )}

          <button type="submit" disabled={loading} className="btn-primary w-full">
            {loading ? 'ĐANG KIỂM TRA…' : 'VÀO HỆ THỐNG'}
          </button>
        </form>

        <div className="mt-8 border-t border-slate-700/60 pt-5">
          <h2 className="mb-2 text-sm font-semibold text-amber-200">LUẬT CHƠI</h2>
          <ol className="list-decimal space-y-1 pl-5 text-xs text-slate-400">
            {RULES.map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ol>
        </div>
      </div>
    </main>
  );
}
