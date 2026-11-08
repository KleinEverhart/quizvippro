import { NextResponse } from 'next/server';
import { studentSession } from '@/lib/auth';
import { db } from '@/lib/db';
import { fail } from '@/lib/http';

export async function GET() {
  const s = studentSession();
  if (!s) return fail(401, 'UNAUTHORIZED');
  const sb = db();
  const now = Date.now();

  // Cập nhật "đang online" thưa thớt (tối đa mỗi 10 giây một lần)
  await sb
    .from('participants')
    .update({ last_seen: new Date(now).toISOString() })
    .eq('id', s.pid)
    .lt('last_seen', new Date(now - 10_000).toISOString());

  const [exam, people, msgs] = await Promise.all([
    sb.from('exam').select('status').eq('id', 1).single(),
    sb.from('participants').select('id, full_name, last_seen').eq('role', 'student').order('joined_at'),
    sb
      .from('chat_messages')
      .select('id, sender_name, body, created_at, participant_id')
      .order('id', { ascending: false })
      .limit(100),
  ]);

  const online = (iso: string) => new Date(iso).getTime() > now - 45_000;
  const list = people.data ?? [];
  // Tài khoản đã bị xóa (sau RESET): buộc đăng nhập lại
  if (!list.some((p) => p.id === s.pid)) return fail(401, 'UNAUTHORIZED');

  return NextResponse.json({
    examStatus: exam.data?.status ?? 'WAITING',
    connected: list.filter((p) => online(p.last_seen)).length,
    // Chỉ trả về tên, không trả về MSSV hay mã định danh
    participants: list.map((p) => ({ name: p.full_name, online: online(p.last_seen), isMe: p.id === s.pid })),
    messages: (msgs.data ?? []).reverse().map((m) => ({
      id: m.id,
      sender: m.sender_name,
      body: m.body,
      at: m.created_at,
      mine: m.participant_id === s.pid,
    })),
  });
}
