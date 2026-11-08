-- =====================================================================
-- MIGRATION v5: 30 giây/câu (thay cho 15 giây của v3).
-- Điểm mỗi câu = số giây còn lại khi trả lời đúng, tối đa 30; 20 câu -> tối đa 600.
-- Chạy SAU migration_v3.sql, 1 lần trong SQL Editor (chạy lại vẫn an toàn).
-- Nếu muốn đổi thời gian mỗi câu, đổi đồng bộ 3 chỗ số 30 dưới đây và
-- SECONDS_PER_QUESTION trong src/lib/rules.ts.
-- =====================================================================

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

  -- Điểm = số giây còn lại (làm tròn xuống), tối đa 30 điểm mỗi câu
  if ok then
    pts := greatest(0, least(30,
      floor(extract(epoch from (a.question_started_at + interval '30 seconds' - now())))::int));
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
