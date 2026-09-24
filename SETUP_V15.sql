-- FANTASY BÀSQUET ALELLA · V13
-- Canvis: mercat pre-Jornada 1, lectura d'entrenadors per usuaris autenticats,
-- classificació pública entre usuaris i dades visibles d'equips/entrenadors.

-- 1) Referències visibles per a usuaris autenticats.
do $$
begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='players' and policyname='Lectura autenticada jugadors') then
    create policy "Lectura autenticada jugadors" on public.players for select to authenticated using (true);
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='real_teams' and policyname='Lectura autenticada equips reals') then
    create policy "Lectura autenticada equips reals" on public.real_teams for select to authenticated using (true);
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='coaches' and policyname='Lectura autenticada entrenadors') then
    create policy "Lectura autenticada entrenadors" on public.coaches for select to authenticated using (true);
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='coach_teams' and policyname='Lectura autenticada relacions entrenadors') then
    create policy "Lectura autenticada relacions entrenadors" on public.coach_teams for select to authenticated using (true);
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='fantasy_rounds' and policyname='Lectura autenticada jornades') then
    create policy "Lectura autenticada jornades" on public.fantasy_rounds for select to authenticated using (true);
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='team_round_results' and policyname='Lectura autenticada resultats jornades') then
    create policy "Lectura autenticada resultats jornades" on public.team_round_results for select to authenticated using (true);
  end if;
end $$;

-- 2) La funció de classificació es recrea més avall amb el càlcul real d'historial i capità.

-- 3) Compra/venda: abans que comenci la Jornada 1 NO hi ha límit de 2 compres.
-- Quan ja hi ha almenys un resultat de la Jornada 1, s'aplica el límit habitual de 2 compres/jornada.
create or replace function public.buy_fantasy_asset(
  p_fantasy_team_id bigint,
  p_player_id bigint default null,
  p_coach_id bigint default null,
  p_coach_real_team_id bigint default null,
  p_round_id bigint default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_round_id bigint;
  v_round_number integer;
  v_budget numeric;
  v_price numeric;
  v_commission numeric;
  v_total numeric;
  v_real_team_id bigint;
  v_buys integer;
begin
  if v_user_id is null then raise exception 'Cal iniciar sessió.'; end if;
  if not exists (select 1 from public.fantasy_teams where id=p_fantasy_team_id and owner_id=v_user_id) then
    raise exception 'No pots modificar aquest equip Fantasy.';
  end if;
  if (p_player_id is null) = (p_coach_id is null) then
    raise exception 'Cal indicar un jugador o un entrenador.';
  end if;

  select id, round_number into v_round_id, v_round_number
  from public.fantasy_rounds
  where (p_round_id is null and is_active=true) or id=p_round_id
  order by is_active desc, round_number desc limit 1;
  if v_round_id is null then raise exception 'No hi ha cap jornada activa.'; end if;

  select budget into v_budget from public.fantasy_teams where id=p_fantasy_team_id for update;

  -- Límite de 2 compres només després d'haver començat la Jornada 1.
  if not (v_round_number = 1 and not exists (select 1 from public.team_round_results where round_id=v_round_id)) then
    select public.count_fantasy_round_buys(p_fantasy_team_id,v_round_id) into v_buys;
    if v_buys >= 2 then raise exception 'Ja has fet els 2 fitxatges màxims d''aquesta jornada.'; end if;
  end if;

  if p_player_id is not null then
    select current_value, real_team_id into v_price, v_real_team_id
    from public.players where id=p_player_id and is_active=true;
    if v_price is null then raise exception 'Jugador no disponible.'; end if;
    if exists (select 1 from public.fantasy_team_players where fantasy_team_id=p_fantasy_team_id and player_id=p_player_id) then raise exception 'Aquest jugador ja és a la plantilla.'; end if;
    if (select count(*) from public.fantasy_team_players ftp join public.players p on p.id=ftp.player_id where ftp.fantasy_team_id=p_fantasy_team_id and p.real_team_id=v_real_team_id) >= 1 then raise exception 'Només pots tenir 1 jugador de cada equip real.'; end if;
    if (select count(*) from public.fantasy_team_players where fantasy_team_id=p_fantasy_team_id) >= 8 then raise exception 'La plantilla ja té 8 jugadors.'; end if;
  else
    if p_coach_real_team_id is null then raise exception 'Cal indicar l''equip real de l''entrenador.'; end if;
    select c.current_value into v_price
    from public.coaches c
    where c.id=p_coach_id and c.is_active=true;
    if v_price is null then raise exception 'Entrenador no disponible.'; end if;
    if not exists (select 1 from public.coach_teams where coach_id=p_coach_id and real_team_id=p_coach_real_team_id) then raise exception 'Aquest entrenador no correspon a aquest equip.'; end if;
    if exists (select 1 from public.fantasy_team_coaches where fantasy_team_id=p_fantasy_team_id and coach_id=p_coach_id and real_team_id=p_coach_real_team_id) then raise exception 'Aquest entrenador ja és a la plantilla.'; end if;
    if (select count(*) from public.fantasy_team_coaches where fantasy_team_id=p_fantasy_team_id) >= 2 then raise exception 'La plantilla ja té 2 entrenadors.'; end if;
  end if;

  v_commission := round(v_price * 0.05,2);
  v_total := v_price + v_commission;
  if v_budget < v_total then raise exception 'No tens prou pressupost. Necessites % i tens %.', v_total, v_budget; end if;

  if p_player_id is not null then
    insert into public.fantasy_team_players(fantasy_team_id,player_id,purchase_value,joined_round_id) values(p_fantasy_team_id,p_player_id,v_price,v_round_id);
  else
    insert into public.fantasy_team_coaches(fantasy_team_id,coach_id,real_team_id,purchase_value,joined_round_id) values(p_fantasy_team_id,p_coach_id,p_coach_real_team_id,v_price,v_round_id);
  end if;
  update public.fantasy_teams set budget=budget-v_total where id=p_fantasy_team_id;
  insert into public.fantasy_transfers(fantasy_team_id,player_id,coach_id,transfer_type,round_id,market_value,commission,total_cost,real_team_id)
  values(p_fantasy_team_id,p_player_id,p_coach_id,'buy',v_round_id,v_price,v_commission,v_total,p_coach_real_team_id);
end;
$$;
revoke all on function public.buy_fantasy_asset(bigint,bigint,bigint,bigint,bigint) from public;
grant execute on function public.buy_fantasy_asset(bigint,bigint,bigint,bigint,bigint) to authenticated;

-- 4) Lectura de punts de classificació també disponible després de reset.

-- V14: selecció de capità i classificació amb multiplicador de capità.

create table if not exists public.fantasy_team_captain_history (
  id bigint generated by default as identity primary key,
  fantasy_team_id bigint not null references public.fantasy_teams(id) on delete cascade,
  round_id bigint not null references public.fantasy_rounds(id) on delete cascade,
  player_id bigint not null references public.players(id) on delete cascade,
  created_at timestamptz default now(),
  unique (fantasy_team_id, round_id)
);

alter table public.fantasy_team_captain_history enable row level security;

drop policy if exists "Lectura pública capitans" on public.fantasy_team_captain_history;
create policy "Lectura pública capitans"
on public.fantasy_team_captain_history
for select to anon, authenticated using (true);

create or replace function public.set_fantasy_captain(
  p_fantasy_team_id bigint,
  p_player_id bigint
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_round_id bigint;
  v_owner uuid;
begin
  select owner_id into v_owner from public.fantasy_teams where id = p_fantasy_team_id;
  if v_owner is null or v_owner <> auth.uid() then
    raise exception 'No tens permís per modificar aquest equip Fantasy.';
  end if;

  select id into v_round_id
  from public.fantasy_rounds
  where is_active = true
  order by round_number desc
  limit 1;

  if v_round_id is null then
    raise exception 'No hi ha cap jornada activa.';
  end if;

  if not exists (
    select 1 from public.fantasy_team_players
    where fantasy_team_id = p_fantasy_team_id and player_id = p_player_id
  ) then
    raise exception 'Aquest jugador no forma part de la teva plantilla.';
  end if;

  update public.fantasy_team_players
  set is_captain = false
  where fantasy_team_id = p_fantasy_team_id;

  update public.fantasy_team_players
  set is_captain = true
  where fantasy_team_id = p_fantasy_team_id and player_id = p_player_id;

  insert into public.fantasy_team_captain_history(fantasy_team_id, round_id, player_id)
  values (p_fantasy_team_id, v_round_id, p_player_id)
  on conflict (fantasy_team_id, round_id)
  do update set player_id = excluded.player_id, created_at = now();
end;
$$;

revoke all on function public.set_fantasy_captain(bigint,bigint) from public;
grant execute on function public.set_fantasy_captain(bigint,bigint) to authenticated;

drop function if exists public.get_fantasy_classification();
create function public.get_fantasy_classification()
returns table (
  fantasy_team_id bigint,
  team_name text,
  total_points numeric,
  budget numeric
)
language sql
security definer
set search_path = public
as $$
  select
    ft.id,
    ft.name,
    coalesce((
      select sum(
        case when cap.player_id is not null
             then (h.total_points * 1.5)
             else h.total_points
        end
      )
      from public.fantasy_team_players ftp
      join public.player_round_history h on h.player_id = ftp.player_id
      left join public.fantasy_team_captain_history cap
        on cap.fantasy_team_id = ft.id
       and cap.round_id = h.round_id
       and cap.player_id = h.player_id
      where ftp.fantasy_team_id = ft.id
    ),0)::numeric
    + coalesce((
      select sum(chr.total_points)
      from public.fantasy_team_coaches ftc
      join public.coach_round_history chr
        on chr.coach_id = ftc.coach_id
       and chr.real_team_id = ftc.real_team_id
      where ftc.fantasy_team_id = ft.id
    ),0)::numeric as total_points,
    coalesce(ft.budget,0)::numeric
  from public.fantasy_teams ft
  order by 3 desc, 2 asc;
$$;
revoke all on function public.get_fantasy_classification() from public;
grant execute on function public.get_fantasy_classification() to authenticated;

-- V15: comptes d'entrenador vinculats als comptes de Supabase.
-- Aquesta és la taula que utilitza el panell d'entrenador.
create table if not exists public.coach_users (
  id bigint generated by default as identity primary key,
  user_id uuid not null unique,
  coach_id bigint not null unique references public.coaches(id) on delete cascade,
  created_at timestamptz default now()
);
alter table public.coach_users enable row level security;
drop policy if exists "Coach user propi" on public.coach_users;
create policy "Coach user propi" on public.coach_users
for select to authenticated using (user_id = auth.uid());

create or replace function public.get_my_coach_context()
returns table (
  coach_id bigint,
  coach_name text,
  real_team_id bigint,
  real_team_name text,
  round_id bigint,
  round_number integer,
  result text,
  highlighted_player_id bigint
)
language sql
security definer
set search_path = public
as $$
  select
    c.id,
    trim(c.name || ' ' || c.surname),
    rt.id,
    rt.name,
    fr.id,
    fr.round_number,
    trr.result,
    trh.player_id
  from public.coach_users cu
  join public.coaches c on c.id = cu.coach_id
  join public.coach_teams ct on ct.coach_id = c.id
  join public.real_teams rt on rt.id = ct.real_team_id
  left join public.fantasy_rounds fr on fr.is_active = true
  left join public.team_round_results trr
    on trr.round_id = fr.id and trr.real_team_id = rt.id
  left join public.team_round_highlights trh
    on trh.round_id = fr.id and trh.real_team_id = rt.id
  where cu.user_id = auth.uid()
  order by rt.id;
$$;
revoke all on function public.get_my_coach_context() from public;
grant execute on function public.get_my_coach_context() to authenticated;

create or replace function public.set_team_round_highlight(
  p_real_team_id bigint,
  p_player_id bigint
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_round_id bigint;
  v_user_coach_id bigint;
begin
  select coach_id into v_user_coach_id
  from public.coach_users
  where user_id = auth.uid();
  if v_user_coach_id is null then
    raise exception 'Aquest compte no està vinculat a cap entrenador.';
  end if;

  if not exists (
    select 1 from public.coach_teams
    where coach_id = v_user_coach_id and real_team_id = p_real_team_id
  ) then
    raise exception 'No tens assignat aquest equip.';
  end if;

  select id into v_round_id
  from public.fantasy_rounds
  where is_active = true
  order by round_number desc
  limit 1;
  if v_round_id is null then raise exception 'No hi ha cap jornada activa.'; end if;

  if not exists (
    select 1 from public.team_round_results
    where round_id = v_round_id and real_team_id = p_real_team_id
  ) then
    raise exception 'Primer cal registrar el resultat de l''equip.';
  end if;

  if not exists (
    select 1 from public.players
    where id = p_player_id and real_team_id = p_real_team_id and is_active = true
  ) then
    raise exception 'Aquest jugador no pertany a l''equip seleccionat.';
  end if;

  if exists (
    select 1 from public.player_round_history
    where round_id = v_round_id and player_id = p_player_id
  ) then
    raise exception 'Aquesta jornada ja ha estat processada i no es pot modificar.';
  end if;

  insert into public.team_round_highlights(round_id, real_team_id, player_id)
  values(v_round_id, p_real_team_id, p_player_id)
  on conflict (round_id, real_team_id)
  do update set player_id = excluded.player_id, created_at = now();
end;
$$;
revoke all on function public.set_team_round_highlight(bigint,bigint) from public;
grant execute on function public.set_team_round_highlight(bigint,bigint) to authenticated;

-- Quan es fa un reset, també es neteja l'historial de capitans.
create or replace function public.admin_reset_rounds(p_pin text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_pin <> '1234' then raise exception 'PIN incorrecte.'; end if;
  delete from public.fantasy_transfers;
  delete from public.player_round_history;
  delete from public.coach_round_history;
  delete from public.team_round_highlights;
  delete from public.team_round_results;
  delete from public.fantasy_team_captain_history;
  delete from public.fantasy_team_players;
  delete from public.fantasy_team_coaches;
  update public.players set current_value = 10;
  update public.coaches set current_value = 12;
  update public.fantasy_teams set budget = 120;
  delete from public.fantasy_rounds where round_number > 1;
  update public.fantasy_rounds set is_active=(round_number=1), name='Jornada 1' where round_number=1;
end;
$$;

-- V15: recorda vincular cada compte de Supabase amb el coach corresponent a coach_users.
