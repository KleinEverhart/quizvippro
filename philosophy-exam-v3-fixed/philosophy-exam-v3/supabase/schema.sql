-- =====================================================================
-- PHILOSOPHY EXAM - schema và logic thi (chạy 1 lần trong Supabase SQL Editor)
-- =====================================================================

create table if not exists exam (
  id int primary key check (id = 1),
  status text not null default 'WAITING' check (status in ('WAITING', 'RUNNING')),
  started_at timestamptz
);
insert into exam (id) values (1) on conflict (id) do nothing;

create table if not exists questions (
  id int primary key,
  question text not null,
  options jsonb not null,                       -- [{"key":"A","text":"..."}, ...]
  answer text not null check (answer in ('A', 'B', 'C', 'D'))
);

create table if not exists participants (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  mssv text not null,
  role text not null default 'student' check (role in ('student', 'admin')),
  joined_at timestamptz not null default now(),
  last_seen timestamptz not null default now()
);
-- Mỗi MSSV chỉ tham gia một lần (áp dụng cho thí sinh)
create unique index if not exists participants_mssv_student_uq
  on participants (mssv) where role = 'student';

create table if not exists attempts (
  id uuid primary key default gen_random_uuid(),
  participant_id uuid not null unique references participants (id) on delete cascade,
  status text not null default 'RUNNING' check (status in ('RUNNING', 'COMPLETED', 'DISQUALIFIED')),
  current_position int not null default 1 check (current_position between 1 and 21),
  question_started_at timestamptz,
  finished_at timestamptz,
  correct_count int not null default 0
);
create index if not exists attempts_status_idx on attempts (status);

create table if not exists attempt_questions (
  attempt_id uuid not null references attempts (id) on delete cascade,
  position int not null check (position between 1 and 20),
  question_id int not null references questions (id),
  option_order text[] not null,   -- option_order[i] = khóa gốc (A-D) đang hiển thị ở vị trí i+1
  selected text,                  -- khóa gốc thí sinh đã chọn
  selected_display text,          -- chữ cái thí sinh đã bấm (theo thứ tự hiển thị)
  is_correct boolean,
  timed_out boolean not null default false,
  answered_at timestamptz,
  primary key (attempt_id, position)
);

create table if not exists violations (
  id bigint generated always as identity primary key,
  participant_id uuid not null references participants (id) on delete cascade,
  attempt_id uuid references attempts (id) on delete cascade,
  kind text not null check (kind in ('tab_hidden', 'window_blur', 'page_leave', 'connection_lost')),
  action text not null check (action in ('WARNING', 'DISQUALIFIED', 'INFO')),
  occurred_at timestamptz not null default now()
);
create index if not exists violations_participant_idx on violations (participant_id);
create index if not exists violations_occurred_idx on violations (occurred_at desc);

create table if not exists chat_messages (
  id bigint generated always as identity primary key,
  participant_id uuid references participants (id) on delete set null,
  sender_name text not null,
  body text not null check (char_length(body) between 1 and 300),
  created_at timestamptz not null default now()
);

-- RLS bật nhưng KHÔNG có policy: khóa công khai không đọc/ghi được gì.
-- Chỉ server (service_role) truy cập dữ liệu.
alter table exam enable row level security;
alter table questions enable row level security;
alter table participants enable row level security;
alter table attempts enable row level security;
alter table attempt_questions enable row level security;
alter table violations enable row level security;
alter table chat_messages enable row level security;

-- ---------------------------------------------------------------------
-- Hàm nội bộ
-- ---------------------------------------------------------------------

create or replace function finish_attempt(p_attempt uuid, p_status text, p_at timestamptz)
returns void language sql security definer set search_path = public as $$
  update attempts
     set status = p_status,
         finished_at = p_at,
         current_position = case when p_status = 'COMPLETED' then 21 else current_position end,
         correct_count = (select count(*) from attempt_questions aq
                          where aq.attempt_id = p_attempt and aq.is_correct is true)
   where id = p_attempt;
$$;

-- Đồng bộ tiến độ theo thời gian máy chủ: hết 30 giây thì tự chuyển câu.
-- Câu đã trả lời sẽ chuyển sang câu kế tiếp sau khi client gọi advance (hoặc sau 3 giây).
create or replace function settle_attempt(p_attempt uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  a attempts%rowtype;
  aq attempt_questions%rowtype;
  ex_status text;
  dl timestamptz;
begin
  select e.status into ex_status from exam e where e.id = 1;
  select * into a from attempts where id = p_attempt for update;
  if not found or a.status <> 'RUNNING' or ex_status <> 'RUNNING' then
    return;
  end if;

  loop
    exit when a.current_position > 20;
    select * into aq from attempt_questions
      where attempt_id = a.id and position = a.current_position;

    if aq.answered_at is null then
      dl := a.question_started_at + interval '30 seconds';
      exit when now() < dl;
      update attempt_questions set timed_out = true, answered_at = dl
        where attempt_id = a.id and position = a.current_position;
      if a.current_position = 20 then
        perform finish_attempt(a.id, 'COMPLETED', dl);
        return;
      end if;
      a.current_position := a.current_position + 1;
      a.question_started_at := dl;
    else
      exit when now() < aq.answered_at + interval '3 seconds';
      a.current_position := a.current_position + 1;
      a.question_started_at := now();
    end if;
  end loop;

  update attempts
     set current_position = a.current_position,
         question_started_at = a.question_started_at
   where id = a.id;
end $$;

create or replace function settle_all()
returns void language plpgsql security definer set search_path = public as $$
declare r record;
begin
  for r in select id from attempts where status = 'RUNNING' loop
    perform settle_attempt(r.id);
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- Hàm công khai cho server
-- ---------------------------------------------------------------------

-- Bắt đầu kỳ thi: tạo bài thi riêng cho từng thí sinh, xáo câu hỏi và đáp án.
create or replace function start_exam()
returns int language plpgsql security definer set search_path = public as $$
declare
  p record;
  qr record;
  pos int;
  n int := 0;
  new_id uuid;
  perm text[];
begin
  if (select count(*) from questions) <> 20 then
    raise exception 'QUESTIONS_NOT_READY';
  end if;

  update exam set status = 'RUNNING', started_at = now()
   where id = 1 and status = 'WAITING';
  if not found then
    raise exception 'EXAM_NOT_WAITING';
  end if;

  for p in select id from participants where role = 'student' loop
    insert into attempts (participant_id, status, current_position, question_started_at)
      values (p.id, 'RUNNING', 1, now())
      returning id into new_id;

    pos := 0;
    for qr in select id from questions order by random() loop
      pos := pos + 1;
      perm := array(select k from unnest(array['A', 'B', 'C', 'D']) as k order by random());
      insert into attempt_questions (attempt_id, position, question_id, option_order)
        values (new_id, pos, qr.id, perm);
    end loop;
    n := n + 1;
  end loop;
  return n;
end $$;

-- Nộp đáp án: chỉ nhận đúng câu hiện tại, chỉ nhận một lần, trong thời hạn.
create or replace function submit_answer(p_attempt uuid, p_pos int, p_choice text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  a attempts%rowtype;
  aq attempt_questions%rowtype;
  q questions%rowtype;
  ex_status text;
  orig text;
  ok boolean;
  correct_idx int;
begin
  if p_choice is null or p_choice not in ('A', 'B', 'C', 'D') then
    return jsonb_build_object('ok', false, 'reason', 'BAD_CHOICE');
  end if;

  perform settle_attempt(p_attempt);

  select e.status into ex_status from exam e where e.id = 1;
  select * into a from attempts where id = p_attempt for update;
  if ex_status <> 'RUNNING' or a.status <> 'RUNNING' or a.current_position <> p_pos then
    return jsonb_build_object('ok', false, 'reason', 'NOT_CURRENT');
  end if;

  select * into aq from attempt_questions
    where attempt_id = a.id and position = p_pos for update;
  if aq.answered_at is not null then
    return jsonb_build_object('ok', false, 'reason', 'ALREADY_ANSWERED');
  end if;

  select * into q from questions where id = aq.question_id;
  orig := aq.option_order[array_position(array['A', 'B', 'C', 'D'], p_choice)];
  ok := (orig = q.answer);
  correct_idx := array_position(aq.option_order, q.answer);

  update attempt_questions
     set selected = orig, selected_display = p_choice, is_correct = ok, answered_at = now()
   where attempt_id = a.id and position = p_pos;

  if p_pos = 20 then
    perform finish_attempt(a.id, 'COMPLETED', now());
  end if;

  return jsonb_build_object('ok', true, 'isCorrect', ok, 'selected', p_choice,
                            'correct', chr(64 + correct_idx));
end $$;

-- Thí sinh bấm "câu tiếp theo" sau khi xem kết quả câu vừa làm.
create or replace function advance_attempt(p_attempt uuid, p_pos int)
returns void language plpgsql security definer set search_path = public as $$
declare
  att attempts%rowtype;
  aq attempt_questions%rowtype;
  ex_status text;
begin
  select e.status into ex_status from exam e where e.id = 1;
  select * into att from attempts where id = p_attempt for update;
  if ex_status <> 'RUNNING' or att.status <> 'RUNNING'
     or att.current_position <> p_pos or p_pos >= 20 then
    return;
  end if;
  select * into aq from attempt_questions where attempt_id = att.id and position = p_pos;
  if aq.answered_at is null then
    return;
  end if;
  update attempts set current_position = p_pos + 1, question_started_at = now() where id = att.id;
end $$;

-- Ghi nhận vi phạm. Lần 1: cảnh cáo. Lần 2: loại khỏi kỳ thi.
-- Mất kết nối chỉ ghi nhận để tham khảo, không tính là vi phạm.
create or replace function record_violation(p_participant uuid, p_kind text)
returns text language plpgsql security definer set search_path = public as $$
declare
  att attempts%rowtype;
  ex_status text;
  counted int;
  act text;
begin
  select * into att from attempts where participant_id = p_participant for update;

  if p_kind = 'connection_lost' then
    insert into violations (participant_id, attempt_id, kind, action)
      values (p_participant, att.id, p_kind, 'INFO');
    return 'INFO';
  end if;

  select e.status into ex_status from exam e where e.id = 1;
  if att.id is null or ex_status <> 'RUNNING' or att.status <> 'RUNNING' then
    return 'IGNORED';
  end if;

  -- Chống ghi nhận trùng: một lần rời trang có thể kích hoạt nhiều sự kiện liên tiếp
  if exists (select 1 from violations
             where participant_id = p_participant and action <> 'INFO'
               and occurred_at > now() - interval '3 seconds') then
    return 'IGNORED';
  end if;

  select count(*) into counted from violations
   where participant_id = p_participant and action <> 'INFO';
  act := case when counted = 0 then 'WARNING' else 'DISQUALIFIED' end;

  insert into violations (participant_id, attempt_id, kind, action)
    values (p_participant, att.id, p_kind, act);

  if act = 'DISQUALIFIED' then
    perform finish_attempt(att.id, 'DISQUALIFIED', now());
  end if;
  return act;
end $$;

-- Chỉ server (service_role) được gọi các hàm này
revoke all on function finish_attempt(uuid, text, timestamptz) from public, anon, authenticated;
revoke all on function settle_attempt(uuid) from public, anon, authenticated;
revoke all on function settle_all() from public, anon, authenticated;
revoke all on function start_exam() from public, anon, authenticated;
revoke all on function submit_answer(uuid, int, text) from public, anon, authenticated;
revoke all on function advance_attempt(uuid, int) from public, anon, authenticated;
revoke all on function record_violation(uuid, text) from public, anon, authenticated;
grant execute on function settle_attempt(uuid) to service_role;
grant execute on function settle_all() to service_role;
grant execute on function start_exam() to service_role;
grant execute on function submit_answer(uuid, int, text) to service_role;
grant execute on function advance_attempt(uuid, int) to service_role;
grant execute on function record_violation(uuid, text) to service_role;
