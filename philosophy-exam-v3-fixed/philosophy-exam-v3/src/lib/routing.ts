import { db } from './db';
import type { Role } from './session';

/** Trang phù hợp với trạng thái hiện tại của người dùng. */
export async function routeFor(s: { pid: string; role: Role } | null): Promise<string> {
  if (!s) return '/';
  if (s.role === 'admin') return '/admin';
  const sb = db();
  const { data: me } = await sb.from('participants').select('voided_reason').eq('id', s.pid).maybeSingle();
  if (!me) return '/'; // tài khoản đã bị xóa (ví dụ sau RESET) -> đăng nhập lại
  if (me.voided_reason) return '/result';
  const { data: exam } = await sb.from('exam').select('status').eq('id', 1).single();
  if (exam?.status === 'WAITING') return '/room';
  if (exam?.status === 'ENDED') return '/result';
  const { data: att } = await sb.from('attempts').select('status').eq('participant_id', s.pid).maybeSingle();
  return att?.status === 'RUNNING' ? '/exam' : '/result';
}
