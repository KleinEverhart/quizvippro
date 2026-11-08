/**
 * Gửi tín hiệu "có thay đổi" tới mọi trình duyệt đang mở trang.
 * Tín hiệu không chứa dữ liệu; trình duyệt tải lại từ API có kiểm tra quyền.
 * Nếu gửi thất bại, trình duyệt vẫn tự cập nhật theo chu kỳ 4-5 giây.
 */
export async function poke(): Promise<void> {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  try {
    await fetch(`${process.env.SUPABASE_URL}/realtime/v1/api/broadcast`, {
      method: 'POST',
      headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: [{ topic: 'exam', event: 'poke', payload: {} }] }),
      signal: AbortSignal.timeout(1500),
    });
  } catch {
    /* bỏ qua: trình duyệt vẫn tự làm mới */
  }
}
