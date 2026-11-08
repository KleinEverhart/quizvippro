import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { db } from '@/lib/db';
import { routeFor } from '@/lib/routing';

export async function GET() {
  const s = getSession();
  if (!s) return NextResponse.json({ authenticated: false, redirect: '/' });
  if (s.role === 'admin') {
    return NextResponse.json({ authenticated: true, role: 'admin', fullName: 'Quản trị viên', redirect: await routeFor(s) });
  }
  const { data } = await db().from('participants').select('full_name, mssv').eq('id', s.pid).maybeSingle();
  if (!data) return NextResponse.json({ authenticated: false, redirect: '/' });
  return NextResponse.json({
    authenticated: true,
    role: 'student',
    fullName: data.full_name,
    mssv: data.mssv,
    redirect: await routeFor(s),
  });
}
