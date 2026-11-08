import { NextResponse } from 'next/server';

export function fail(status: number, error: string) {
  return NextResponse.json({ error }, { status });
}
