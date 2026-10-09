-- 2026-10-09: подсказки в базе + атомарные начисления.
-- Выполнить один раз в Supabase → SQL Editor ДО деплоя кода, который вызывает эти функции.
-- Повторный запуск безопасен (if not exists / create or replace).

-- Купленные и ещё не использованные подсказки игрока
alter table public.users add column if not exists hints integer not null default 0;

-- Оплата: запись платежа + начисление одной транзакцией.
-- true — платёж новый и начислен; false — этот charge_id уже обработан.
create or replace function public.record_payment(
  p_telegram_id bigint, p_charge_id text, p_item text, p_amount integer, p_hints integer
) returns boolean
language plpgsql security definer set search_path = public as $$
begin
  insert into payments (telegram_id, payment_charge_id, item, amount)
  values (p_telegram_id, p_charge_id, p_item, p_amount)
  on conflict (payment_charge_id) do nothing;
  if not found then
    return false;
  end if;
  insert into users (telegram_id, stars_balance, hints)
  values (p_telegram_id, p_amount, p_hints)
  on conflict (telegram_id) do update
    set stars_balance = coalesce(users.stars_balance, 0) + excluded.stars_balance,
        hints = coalesce(users.hints, 0) + excluded.hints;
  return true;
end $$;

-- Итог партии: +1 к wins/losses/draws атомарно, сохранённая партия чистится
create or replace function public.record_result(
  p_telegram_id bigint, p_username text, p_result text
) returns setof users
language plpgsql security definer set search_path = public as $$
begin
  if p_result not in ('win', 'lose', 'draw') then
    raise exception 'invalid result %', p_result;
  end if;
  return query
  insert into users (telegram_id, username, wins, losses, draws, game_state)
  values (p_telegram_id, p_username,
          (p_result = 'win')::int, (p_result = 'lose')::int, (p_result = 'draw')::int, null)
  on conflict (telegram_id) do update
    set username = excluded.username,
        wins = coalesce(users.wins, 0) + excluded.wins,
        losses = coalesce(users.losses, 0) + excluded.losses,
        draws = coalesce(users.draws, 0) + excluded.draws,
        game_state = null
  returning *;
end $$;

-- Списание одной подсказки. Возвращает остаток или -1, если подсказок нет.
create or replace function public.use_hint(p_telegram_id bigint) returns integer
language plpgsql security definer set search_path = public as $$
declare v integer;
begin
  update users set hints = hints - 1
  where telegram_id = p_telegram_id and hints > 0
  returning hints into v;
  return coalesce(v, -1);
end $$;

-- Вызывать функции может только сервер (секретный ключ = service_role),
-- не публичный ключ.
revoke execute on function public.record_payment(bigint, text, text, integer, integer) from public, anon, authenticated;
revoke execute on function public.record_result(bigint, text, text) from public, anon, authenticated;
revoke execute on function public.use_hint(bigint) from public, anon, authenticated;
grant execute on function public.record_payment(bigint, text, text, integer, integer) to service_role;
grant execute on function public.record_result(bigint, text, text) to service_role;
grant execute on function public.use_hint(bigint) to service_role;
