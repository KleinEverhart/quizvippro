'use client';

import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { onPoke } from '@/lib/realtime';
import { RULES } from '@/lib/rules';

type Room = {
  examStatus: 'WAITING' | 'RUNNING' | 'ENDED';
  connected: number;
  participants: { name: string; online: boolean; isMe: boolean }[];
  messages: { id: number; sender: string; body: string; at: string; mine: boolean }[];
};

export default function RoomPage() {
  const router = useRouter();
  const [room, setRoom] = useState<Room | null>(null);
  const [text, setText] = useState('');
  const [error, setError] = useState('');
  const [sending, setSending] = useState(false);
  const chatRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    try {
      const r = await fetch('/api/room', { cache: 'no-store' });
      if (r.status === 401) return router.replace('/');
      if (!r.ok) return;
      const d: Room = await r.json();
      if (d.examStatus !== 'WAITING') return router.replace(d.examStatus === 'RUNNING' ? '/exam' : '/result');
      setRoom(d);
    } catch {
      /* giữ dữ liệu cũ, thử lại ở lần sau */
    }
  }, [router]);

  useEffect(() => {
    load();
    const timer = setInterval(load, 4000);
    const off = onPoke(load);
    return () => {
      clearInterval(timer);
      off();
    };
  }, [load]);

  useEffect(() => {
    const el = chatRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [room?.messages.length]);

  async function send(e: FormEvent) {
    e.preventDefault();
    const body = text.trim();
    if (!body || sending) return;
    setSending(true);
    setError('');
    try {
      const r = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body }),
      });
      const d = await r.json();
      if (!r.ok) setError(d.error ?? 'Không gửi được tin nhắn.');
      else {
        setText('');
        load();
      }
    } catch {
      setError('Mất kết nối. Tin nhắn chưa được gửi.');
    } finally {
      setSending(false);
    }
  }

  async function logout() {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.replace('/');
  }

  return (
    <main className="min-h-screen px-4 py-6 md:px-8">
      <header className="mx-auto mb-6 flex max-w-6xl flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-xs tracking-[0.3em] text-sky-300/80">PHILOSOPHY EXAM</p>
          <h1 className="text-2xl font-bold md:text-3xl">WAITING ROOM</h1>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <span className="rounded-full border border-amber-400/40 bg-amber-400/10 px-4 py-1.5 text-sm text-amber-200">
            Đang chờ quản trị viên bắt đầu kỳ thi
          </span>
          <button onClick={logout} className="btn-ghost">Thoát</button>
        </div>
      </header>

      <section className="glass msg-in mx-auto mb-6 max-w-6xl p-5">
        <h2 className="mb-3 font-semibold text-amber-200">LUẬT CHƠI</h2>
        <ol className="list-decimal space-y-1.5 pl-5 text-sm text-slate-300">
          {RULES.map((r) => (
            <li key={r}>{r}</li>
          ))}
        </ol>
      </section>

      {!room ? (
        <p className="text-center text-slate-400">Đang tải phòng chờ…</p>
      ) : (
        <div className="mx-auto grid max-w-6xl gap-6 lg:grid-cols-[300px_1fr]">
          <section className="glass p-5">
            <div className="mb-4 flex items-end justify-between">
              <h2 className="font-semibold">Thí sinh trong phòng</h2>
              <span className="text-3xl font-bold tabular-nums text-sky-300">{room.connected}</span>
            </div>
            <ul className="max-h-[56vh] space-y-2 overflow-y-auto pr-1">
              {room.participants.map((p, i) => (
                <li key={i} className="flex items-center gap-3 rounded-xl bg-slate-900/50 px-3 py-2">
                  <span
                    className={`h-2.5 w-2.5 shrink-0 rounded-full ${
                      p.online ? 'bg-emerald-400 shadow-[0_0_8px_#34d399]' : 'bg-slate-600'
                    }`}
                  />
                  <span className="truncate">
                    {p.name}
                    {p.isMe && <span className="ml-2 text-xs text-sky-300">(bạn)</span>}
                  </span>
                </li>
              ))}
            </ul>
          </section>

          <section className="glass flex flex-col p-5">
            <h2 className="mb-4 font-semibold">Trò chuyện</h2>
            <div ref={chatRef} className="flex-1 space-y-3 overflow-y-auto pr-1" style={{ height: '52vh' }}>
              {room.messages.length === 0 && (
                <p className="pt-10 text-center text-sm text-slate-500">Chưa có tin nhắn nào.</p>
              )}
              {room.messages.map((m) => (
                <div key={m.id} className={`msg-in flex flex-col ${m.mine ? 'items-end' : 'items-start'}`}>
                  <span className="mb-1 text-xs text-slate-400">
                    {m.mine ? 'Bạn' : m.sender} ·{' '}
                    {new Date(m.at).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}
                  </span>
                  <div
                    className={`max-w-[80%] break-words rounded-2xl px-4 py-2 text-sm ${
                      m.mine ? 'rounded-br-sm bg-electric text-white' : 'rounded-bl-sm bg-slate-800'
                    }`}
                  >
                    {m.body}
                  </div>
                </div>
              ))}
            </div>
            <form onSubmit={send} className="mt-4 flex gap-2">
              <input
                value={text}
                onChange={(e) => setText(e.target.value)}
                maxLength={300}
                placeholder="Nhập tin nhắn…"
                className="input flex-1"
              />
              <button type="submit" disabled={sending || !text.trim()} className="btn-primary">
                Gửi
              </button>
            </form>
            {error && <p className="mt-2 text-sm text-rose-300">{error}</p>}
          </section>
        </div>
      )}
    </main>
  );
}
