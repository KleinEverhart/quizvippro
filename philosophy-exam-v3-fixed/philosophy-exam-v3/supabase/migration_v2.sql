-- =====================================================================
-- MIGRATION v2: thêm nút DỪNG THI (ENDED) và RESET kỳ thi
-- Chạy 1 lần trong SQL Editor của project (an toàn khi chạy lại)
-- =====================================================================

alter table exam drop constraint if exists exam_status_check;
alter table exam add constraint exam_status_check
  check (status in ('WAITING', 'RUNNING', 'ENDED'));

-- DỪNG THI: chốt tất cả bài đang làm, câu chưa trả lời tính là bỏ trống
create or replace function end_exam()
returns int language plpgsql security definer set search_path = public as $$
declare
  r record;
  n int := 0;
begin
  update exam set status = 'ENDED' where id = 1 and status = 'RUNNING';
  if not found then
    raise exception 'EXAM_NOT_RUNNING';
  end if;

  for r in select id from attempts where status = 'RUNNING' loop
    update attempt_questions set timed_out = true, answered_at = now()
     where attempt_id = r.id and answered_at is null;
    perform finish_attempt(r.id, 'COMPLETED', now());
    n := n + 1;
  end loop;
  return n;
end $$;

-- RESET: xóa thí sinh, bài thi, vi phạm, chat; giữ tài khoản admin
create or replace function reset_exam()
returns void language plpgsql security definer set search_path = public as $$
begin
  delete from chat_messages;
  delete from violations;
  delete from attempts;
  delete from participants where role = 'student';
  update exam set status = 'WAITING', started_at = null where id = 1;
end $$;

revoke all on function end_exam() from public, anon, authenticated;
revoke all on function reset_exam() from public, anon, authenticated;
grant execute on function end_exam() to service_role;
grant execute on function reset_exam() to service_role;
