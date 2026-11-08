-- =====================================================================
-- MIGRATION v3: 15 giây/câu, điểm = số giây còn lại khi trả lời đúng,
-- hủy kết quả khi nhập sai họ tên hoặc làm bài từ 2 lần trở lên.
-- Chạy SAU migration_v2.sql, 1 lần trong SQL Editor (chạy lại vẫn an toàn).
-- =====================================================================

alter table attempts add column if not exists score int not null default 0;
alter table attempt_questions add column if not exists points int not null default 0;
alter table participants add column if not exists voided_reason text;

create or replace function finish_attempt(p_attempt uuid, p_status text, p_at timestamptz)
returns void language sql security definer set search_path = public as $$
  update attempts
     set status = p_status,
         finished_at = p_at,
         current_position = case when p_status = 'COMPLETED' then 21 else current_position end,
         correct_count = (select count(*) from attempt_questions aq
                          where aq.attempt_id = p_attempt and aq.is_correct is true),
         score = case when p_status = 'COMPLETED' then
                   (select coalesce(sum(aq.points), 0) from attempt_questions aq
                     where aq.attempt_id = p_attempt)
                 else 0 end
   where id = p_attempt;
$$;

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
      dl := a.question_started_at + interval '15 seconds';
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
  pts int := 0;
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

  -- Điểm = số giây còn lại (làm tròn xuống), tối đa 15 điểm mỗi câu
  if ok then
    pts := greatest(0, least(15,
      floor(extract(epoch from (a.question_started_at + interval '15 seconds' - now())))::int));
  end if;

  update attempt_questions
     set selected = orig, selected_display = p_choice, is_correct = ok,
         points = pts, answered_at = now()
   where attempt_id = a.id and position = p_pos;

  if p_pos = 20 then
    perform finish_attempt(a.id, 'COMPLETED', now());
  end if;

  return jsonb_build_object('ok', true, 'isCorrect', ok, 'points', pts,
                            'selected', p_choice, 'correct', chr(64 + correct_idx));
end $$;

-- Thí sinh bị hủy kết quả không được đưa vào bài thi
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

  for p in select id from participants
            where role = 'student' and voided_reason is null loop
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
