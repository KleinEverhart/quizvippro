import { NextResponse } from 'next/server';
import { studentSession } from '@/lib/auth';
import { db } from '@/lib/db';
import { fail } from '@/lib/http';
import { poke } from '@/lib/poke';

export async function POST(req: Request) {
  const s = studentSession();
  if (!s) return fail(401, 'UNAUTHORIZED');

  const body = await req.json().catch(() => null);
  const text = typeof body?.body === 'string' ? body.body.trim() : '';
  if (!text || text.length > 300) return fail(400, 'Tin nhắn cần từ 1 đến 300 ký tự.');

  const sb = db();
  const { data: exam } = await sb.from('exam').select('status').eq('id', 1).single();
  if (exam?.status !== 'WAITING') return fail(403, 'Phòng chat đã đóng.');

  const { data: last } = await sb
    .from('chat_messages')
    .select('created_at')
    .eq('participant_id', s.pid)
    .order('id', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (last && Date.now() - new Date(last.created_at).getTime() < 1500) {
    return fail(429, 'Bạn gửi quá nhanh, vui lòng chờ một chút.');
  }

  // Tên người gửi lấy từ máy chủ, không tin theo dữ liệu từ trình duyệt
  const { data: me } = await sb.from('participants').select('full_name').eq('id', s.pid).maybeSingle();
  if (!me) return fail(401, 'UNAUTHORIZED');
  const { error } = await sb
    .from('chat_messages')
    .insert({ participant_id: s.pid, sender_name: me.full_name, body: text });
  if (error) return fail(500, 'Không gửi được tin nhắn.');

  await poke();
  return NextResponse.json({ ok: true });
}
