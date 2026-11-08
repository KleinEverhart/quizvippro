import { timingSafeEqual } from 'node:crypto';
import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { fail } from '@/lib/http';
import { routeFor } from '@/lib/routing';
import { createSession, SESSION_COOKIE, type Role } from '@/lib/session';

const clean = (v: unknown, max: number) => String(v ?? '').trim().replace(/\s+/g, ' ').slice(0, max);
const NAME_RE = /^\p{L}[\p{L} .'-]*$/u;

function sameText(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

function startSession(pid: string, role: Role) {
  return routeFor({ pid, role }).then((redirect) => {
    const { token, maxAge } = createSession(pid, role);
    const res = NextResponse.json({ ok: true, redirect });
    res.cookies.set(SESSION_COOKIE, token, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      maxAge,
    });
    return res;
  });
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const fullName = clean(body?.fullName, 60);
  const mssv = clean(body?.mssv, 20);
  if (!fullName || !mssv) return fail(400, 'Vui lòng nhập đầy đủ họ tên và MSSV.');

  const adminUser = process.env.ADMIN_USERNAME ?? '';
  const adminMssv = process.env.ADMIN_MSSV ?? '';
  const sb = db();

  // Quản trị viên
  if (adminUser && fullName.toLowerCase() === adminUser.toLowerCase()) {
    if (!adminMssv || !sameText(mssv, adminMssv)) return fail(401, 'Thông tin đăng nhập không đúng.');
    let { data: admin } = await sb.from('participants').select('id').eq('role', 'admin').maybeSingle();
    if (!admin) {
      const ins = await sb
        .from('participants')
        .insert({ full_name: adminUser, mssv: adminMssv, role: 'admin' })
        .select('id')
        .single();
      if (ins.error) return fail(500, 'Không tạo được tài khoản quản trị.');
      admin = ins.data;
    }
    return startSession(admin!.id, 'admin');
  }

  if (adminMssv && sameText(mssv, adminMssv)) return fail(403, 'MSSV này không hợp lệ.');

  // Thí sinh: họ tên phải là họ tên thật (ít nhất 2 từ, chỉ gồm chữ)
  if (!NAME_RE.test(fullName) || fullName.split(' ').length < 2) {
    return fail(400, 'Vui lòng nhập đầy đủ họ và tên thật (ít nhất 2 từ, chỉ gồm chữ).');
  }

  const { data: sameMssv } = await sb
    .from('participants')
    .select('id, full_name')
    .eq('role', 'student')
    .eq('mssv', mssv)
    .maybeSingle();
  const { data: sameName } = await sb
    .from('participants')
    .select('id, full_name')
    .eq('role', 'student')
    .ilike('full_name', fullName);

  // Luật 2: cùng MSSV nhưng khác họ tên -> hủy kết quả
  if (sameMssv) {
    if (sameMssv.full_name.toLowerCase() === fullName.toLowerCase()) {
      return startSession(sameMssv.id, 'student');
    }
    await sb.from('participants').update({ voided_reason: 'Nhập sai họ và tên' }).eq('id', sameMssv.id);
    return fail(409, 'Họ và tên không khớp với lần đăng ký trước. Kết quả của bạn đã bị hủy.');
  }

  // Luật 3: cùng họ tên nhưng khác MSSV (đăng ký lần 2) -> hủy kết quả của các lần trước
  if (sameName && sameName.length > 0) {
    await sb
      .from('participants')
      .update({ voided_reason: 'Làm bài từ 2 lần trở lên' })
      .in('id', sameName.map((p) => p.id));
    return fail(409, 'Bạn đã đăng ký trước đó. Làm bài từ 2 lần trở lên sẽ hủy kết quả.');
  }

  const { data: exam } = await sb.from('exam').select('status').eq('id', 1).single();
  if (exam?.status !== 'WAITING') {
    return fail(403, 'Kỳ thi đã bắt đầu. Bạn không thể tham gia lúc này.');
  }

  const ins = await sb
    .from('participants')
    .insert({ full_name: fullName, mssv, role: 'student' })
    .select('id')
    .single();
  if (ins.error) {
    if (ins.error.code === '23505') return fail(409, 'MSSV này đã được đăng ký.');
    return fail(500, 'Không thể đăng nhập, vui lòng thử lại.');
  }
  return startSession(ins.data.id, 'student');
}
