'use client';

import { createClient } from '@supabase/supabase-js';

/** Lắng nghe tín hiệu "poke" và gọi callback để tải lại dữ liệu từ API. */
export function onPoke(callback: () => void): () => void {
  try {
    const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const channel = sb.channel('exam').on('broadcast', { event: 'poke' }, () => callback()).subscribe();
    return () => {
      sb.removeChannel(channel);
    };
  } catch {
    return () => {};
  }
}
