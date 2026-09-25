-- FANTASY BÀSQUET ALELLA · V17
-- Classificació amb nom d'usuari + funció segura del jugador destacat.

-- 1) Actualitza els noms dels equips Fantasy existents amb el nom d'usuari
-- guardat a Supabase Auth, quan n'hi hagi.
update public.fantasy_teams ft
set name = coalesce(nullif(trim(u.raw_user_meta_data->>'username'), ''), ft.name)
from auth.users u
where u.id = ft.owner_id
  and nullif(trim(u.raw_user_meta_data->>'username'), '') is not null;

-- 2) Classificació: no exposar mai el correu electrònic.
drop function if exists public.get_fantasy_classification();

create or replace function public.get_fantasy_classification()
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
    ft.id as fantasy_team_id,
    coalesce(
      nullif(trim(u.raw_user_meta_data->>'username'), ''),
      nullif(trim(ft.name), ''),
      'Equip Fantasy'
    ) as team_name,
    coalesce((
      select sum(
        case
          when h.result = 'win' then h.win_points + h.highlight_points
          else h.highlight_points
        end
      )
      from public.fantasy_team_players ftp
      join public.player_round_history h
        on h.player_id = ftp.player_id
      where ftp.fantasy_team_id = ft.id
    ), 0)::numeric
    +
    coalesce((
      select sum(chr.total_points)
      from public.fantasy_team_coaches ftc
      join public.coach_round_history chr
        on chr.coach_id = ftc.coach_id
       and chr.real_team_id = ftc.real_team_id
      where ftc.fantasy_team_id = ft.id
    ), 0)::numeric as total_points,
    coalesce(ft.budget, 0)::numeric as budget
  from public.fantasy_teams ft
  left join auth.users u on u.id = ft.owner_id
  order by total_points desc, team_name asc;
$$;

revoke all on function public.get_fantasy_classification() from public;
grant execute on function public.get_fantasy_classification() to authenticated;

-- 3) Funció utilitzada pel panell d'entrenador per seleccionar el destacat.
drop function if exists public.coach_set_round_highlight(bigint,bigint,bigint);

create or replace function public.coach_set_round_highlight(
  p_round_id bigint,
  p_real_team_id bigint,
  p_player_id bigint
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_coach_id bigint;
begin
  if v_user_id is null then
    raise exception 'Cal iniciar sessió.';
  end if;

  select coach_id
  into v_coach_id
  from public.coach_profiles
  where user_id = v_user_id
  limit 1;

  if v_coach_id is null then
    raise exception 'Aquest compte no està vinculat a cap entrenador.';
  end if;

  if not exists (
    select 1
    from public.coach_teams
    where coach_id = v_coach_id
      and real_team_id = p_real_team_id
  ) then
    raise exception 'No tens permisos per gestionar aquest equip.';
  end if;

  if not exists (
    select 1
    from public.fantasy_rounds
    where id = p_round_id
  ) then
    raise exception 'La jornada indicada no existeix.';
  end if;

  if exists (
    select 1 from public.player_round_history where round_id = p_round_id
  ) or exists (
    select 1 from public.coach_round_history where round_id = p_round_id
  ) then
    raise exception 'Aquesta jornada ja ha estat processada i no es pot modificar.';
  end if;

  if not exists (
    select 1
    from public.team_round_results
    where round_id = p_round_id
      and real_team_id = p_real_team_id
  ) then
    raise exception 'Primer cal introduir el resultat d''aquest equip.';
  end if;

  if not exists (
    select 1
    from public.players
    where id = p_player_id
      and real_team_id = p_real_team_id
      and is_active = true
  ) then
    raise exception 'Aquest jugador no pertany a aquest equip.';
  end if;

  delete from public.team_round_highlights
  where round_id = p_round_id
    and real_team_id = p_real_team_id;

  insert into public.team_round_highlights (
    round_id,
    real_team_id,
    player_id
  )
  values (
    p_round_id,
    p_real_team_id,
    p_player_id
  );
end;
$$;

revoke all on function public.coach_set_round_highlight(bigint,bigint,bigint) from public;
grant execute on function public.coach_set_round_highlight(bigint,bigint,bigint) to authenticated;
