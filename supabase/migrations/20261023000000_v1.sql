-- Cola Aqui · V1 (23/10/2026)
--   * miniatura do vídeo (capa enquanto carrega) — RF-06
--   * detalhe de uma publicação para o player em tela cheia
--   * horário "aberto agora" pelo horário informado — PRD 3.1
--   * demonstração que se renova sozinha (só para testes; desligar antes do piloto)

-- ---------- miniaturas ----------
create or replace function public.is_public_media(p_path text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from media_assets m join posts p on p.media_id = m.id
    join places l on l.id = p.place_id and l.status = 'active'
    where (m.path = p_path or m.thumbnail_path = p_path) and p.status = 'published'
  );
$$;

drop function if exists public.explore_feed(double precision, double precision, int, text, public.place_category, timestamptz, int);
create function public.explore_feed(
  p_lat double precision,
  p_lng double precision,
  p_radius_m int default 15000,
  p_mode text default 'agora',
  p_category public.place_category default null,
  p_before timestamptz default null,
  p_limit int default 20
)
returns table (
  id uuid, caption text, origin public.post_origin, sponsored boolean,
  published_at timestamptz, is_fresh boolean, media_path text, media_mime text, thumb_path text,
  place_id uuid, place_name text, place_category public.place_category, place_neighborhood text,
  author_username text, distance_m double precision
)
language sql stable security definer set search_path = public, extensions as $$
  select p.id, p.caption, p.origin, p.sponsored, p.published_at, (p.fresh_until > now()),
         m.path, m.mime, m.thumbnail_path, l.id, l.name, l.category, l.neighborhood, pr.username,
         st_distance(l.location, st_setsrid(st_makepoint(p_lng, p_lat), 4326)::geography)
  from posts p
  join places l on l.id = p.place_id and l.status = 'active'
  join media_assets m on m.id = p.media_id
  join profiles pr on pr.id = p.author
  where p.status = 'published'
    and st_dwithin(l.location, st_setsrid(st_makepoint(p_lng, p_lat), 4326)::geography, p_radius_m)
    and (p_category is null or l.category = p_category)
    and (p_before is null or p.published_at < p_before)
    and case p_mode
          when 'agora' then p.fresh_until > now()
          when 'hoje' then p.published_at >= date_trunc('day', now() at time zone 'America/Sao_Paulo') at time zone 'America/Sao_Paulo'
          else true
        end
  order by p.published_at desc
  limit least(greatest(p_limit, 1), 50);
$$;

drop function if exists public.place_posts(uuid, int);
create function public.place_posts(p_place uuid, p_limit int default 20)
returns table (
  id uuid, caption text, origin public.post_origin, sponsored boolean,
  published_at timestamptz, is_fresh boolean, media_path text, media_mime text, thumb_path text, author_username text
)
language sql stable security definer set search_path = public as $$
  select p.id, p.caption, p.origin, p.sponsored, p.published_at, (p.fresh_until > now()),
         m.path, m.mime, m.thumbnail_path, pr.username
  from posts p
  join media_assets m on m.id = p.media_id
  join profiles pr on pr.id = p.author
  join places l on l.id = p.place_id and l.status = 'active'
  where p.place_id = p_place and p.status = 'published'
  order by p.published_at desc
  limit least(greatest(p_limit, 1), 50);
$$;

-- detalhe de uma publicação (player em tela cheia); só publicadas
create or replace function public.post_detail(p_post uuid)
returns table (
  id uuid, caption text, origin public.post_origin, sponsored boolean,
  published_at timestamptz, is_fresh boolean, media_path text, media_mime text, thumb_path text,
  place_id uuid, place_name text, place_category public.place_category, place_neighborhood text,
  place_address text, lat double precision, lng double precision, author_username text
)
language sql stable security definer set search_path = public, extensions as $$
  select p.id, p.caption, p.origin, p.sponsored, p.published_at, (p.fresh_until > now()),
         m.path, m.mime, m.thumbnail_path, l.id, l.name, l.category, l.neighborhood, l.address,
         st_y(l.location::geometry), st_x(l.location::geometry), pr.username
  from posts p
  join places l on l.id = p.place_id and l.status = 'active'
  join media_assets m on m.id = p.media_id
  join profiles pr on pr.id = p.author
  where p.id = p_post and p.status = 'published';
$$;

-- publicar agora aceita a miniatura gerada no aparelho
drop function if exists public.create_post(uuid, text, text, bigint, numeric, text, boolean);
create function public.create_post(
  p_place uuid,
  p_media_path text,
  p_mime text,
  p_size_bytes bigint,
  p_duration_s numeric,
  p_caption text,
  p_accept_policies boolean,
  p_thumb_path text default null
)
returns table (post_id uuid, status public.post_status)
language plpgsql security definer set search_path = public as $$
#variable_conflict use_column
declare
  v_uid uuid := auth.uid();
  v_media uuid;
  v_post uuid;
  v_origin post_origin;
  v_status post_status := 'pending_review';
  v_fresh int := public.config_int('fresh_minutes', 60);
  v_max_s int := public.config_int('video_max_seconds', 20);
  v_max_mb int := public.config_int('video_max_mb', 60);
begin
  if v_uid is null then raise exception 'Entre na sua conta para publicar'; end if;
  if (select status from profiles where id = v_uid) <> 'active' then raise exception 'Conta suspensa'; end if;
  if not coalesce(p_accept_policies, false) then raise exception 'É preciso aceitar as políticas de publicação'; end if;
  if not exists (select 1 from places where id = p_place and status = 'active') then
    raise exception 'Escolha um lugar do catálogo';
  end if;
  if split_part(p_media_path, '/', 1) <> v_uid::text then raise exception 'Arquivo inválido'; end if;
  if p_thumb_path is not null and split_part(p_thumb_path, '/', 1) <> v_uid::text then raise exception 'Miniatura inválida'; end if;
  if p_mime not like 'video/%' then raise exception 'Envie um vídeo'; end if;
  if p_duration_s is not null and p_duration_s > v_max_s + 0.5 then
    raise exception 'O vídeo pode ter até % segundos', v_max_s;
  end if;
  if p_size_bytes is not null and p_size_bytes > v_max_mb::bigint * 1024 * 1024 then
    raise exception 'O vídeo pode ter até % MB', v_max_mb;
  end if;
  if (select count(*) from posts where author = v_uid and created_at > now() - interval '1 hour') >= 5 then
    raise exception 'Limite de 5 publicações por hora';
  end if;
  if exists (select 1 from posts where author = v_uid and place_id = p_place and created_at > now() - interval '10 minutes') then
    raise exception 'Aguarde 10 minutos para publicar de novo neste lugar';
  end if;

  v_origin := case
    when public.can_manage_place(p_place) then 'establishment'::post_origin
    when (select role from profiles where id = v_uid) = 'creator' then 'creator'::post_origin
    else 'user'::post_origin end;

  insert into media_assets (owner, path, mime, size_bytes, duration_s, thumbnail_path)
  values (v_uid, p_media_path, p_mime, p_size_bytes, p_duration_s, p_thumb_path)
  returning id into v_media;

  if public.config_text('moderation_mode', 'manual') = 'auto' then v_status := 'published'; end if;

  insert into posts (author, place_id, media_id, caption, origin, status, published_at, fresh_until)
  values (v_uid, p_place, v_media, nullif(trim(p_caption), ''), v_origin, v_status,
          case when v_status = 'published' then now() end,
          case when v_status = 'published' then now() + make_interval(mins => v_fresh) end)
  returning id into v_post;

  return query select v_post, v_status;
end;
$$;

revoke execute on function public.explore_feed(double precision, double precision, int, text, public.place_category, timestamptz, int) from public;
revoke execute on function public.place_posts(uuid, int) from public;
revoke execute on function public.post_detail(uuid) from public;
revoke execute on function public.create_post(uuid, text, text, bigint, numeric, text, boolean, text) from public, anon;
grant execute on function public.explore_feed(double precision, double precision, int, text, public.place_category, timestamptz, int) to anon, authenticated;
grant execute on function public.place_posts(uuid, int) to anon, authenticated;
grant execute on function public.post_detail(uuid) to anon, authenticated;
grant execute on function public.create_post(uuid, text, text, bigint, numeric, text, boolean, text) to authenticated;

-- ---------- demonstração que se renova (SÓ PARA TESTES) ----------
-- Guarda há quantos minutos cada post de demo "foi publicado"; o agendamento reposiciona os horários.
create table if not exists public.demo_posts (
  post_id uuid primary key references public.posts (id) on delete cascade,
  ago_min int not null
);
alter table public.demo_posts enable row level security; -- sem políticas: invisível para o app

create or replace function public.demo_refresh()
returns void language sql security definer set search_path = public as $$
  update posts p
     set created_at = now() - make_interval(mins => d.ago_min + 2),
         published_at = now() - make_interval(mins => d.ago_min),
         fresh_until = now() - make_interval(mins => d.ago_min) + make_interval(mins => public.config_int('fresh_minutes', 60))
    from demo_posts d
   where d.post_id = p.id;
$$;
revoke execute on function public.demo_refresh() from public, anon, authenticated;

create extension if not exists pg_cron;
select cron.unschedule(jobid) from cron.job where jobname = 'cola_aqui_demo_refresh';
select cron.schedule('cola_aqui_demo_refresh', '*/10 * * * *', 'select public.demo_refresh()');
-- Antes do piloto:  select cron.unschedule('cola_aqui_demo_refresh');  e rode supabase/demo_clear.sql
