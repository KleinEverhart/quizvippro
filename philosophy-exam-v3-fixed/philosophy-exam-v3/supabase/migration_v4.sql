-- =====================================================================
-- MIGRATION v4: RESET xóa sạch toàn bộ dữ liệu thi
-- Chạy SAU migration_v2.sql và migration_v3.sql (chạy lại vẫn an toàn).
-- Xóa: thí sinh, bài làm, điểm, bảng xếp hạng, vi phạm, chat, số liệu
-- truy cập (đăng nhập / online). Giữ: ngân hàng câu hỏi và tài khoản admin.
-- Đặt lại bộ đếm id của chat và vi phạm về 1.
-- =====================================================================

create or replace function reset_exam()
returns void language plpgsql security definer set search_path = public as $$
begin
  truncate table attempt_questions, violations, attempts, chat_messages restart identity;
  delete from participants where role = 'student';
  update exam set status = 'WAITING', started_at = null where id = 1;
end $$;

revoke all on function reset_exam() from public, anon, authenticated;
grant execute on function reset_exam() to service_role;
