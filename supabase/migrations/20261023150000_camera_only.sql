-- Cola Aqui · Só vídeo gravado agora, pela câmera do app (23/10/2026)
--
-- Decisão de produto: nada de galeria. O vídeo tem que ser gravado no app e enviado em até 10 min.
-- Assim ninguém posta o vídeo de ontem como se fosse de agora.
--
--   * o app manda quando gravou (p_recorded_at) e de onde veio (p_capture = 'camera')
--   * o servidor recusa: galeria, gravação com mais de 10 min, horário no futuro
--   * "Publicado há X min" e a janela do Agora passam a contar da GRAVAÇÃO
--   * a versão antiga de create_post (que aceitava galeria) deixa de existir
--
-- Limite honesto: um app adulterado ainda pode mentir esses campos. A trava forte vem depois,
-- com App Attest (iOS) / Play Integrity (Android) no build de loja. A moderação segue como rede de proteção.

insert into public.app_config (key, value, description) values
  ('capture_mode', '"camera_only"', 'camera_only: só vídeo gravado pela câmera do app'),
  ('max_record_age_minutes', '10', 'Tempo máximo entre gravar e enviar (min)')
on conflict (key) do nothing;

alter table public.media_assets add column if not exists recorded_at timestamptz;
alter table public.media_assets add column if not exists capture_source text
  check (capture_source in ('camera', 'gallery', 'demo'));
alter table public.posts add column if not exists recorded_at timestamptz;

-- vídeos que já existem: gravação = envio
update public.posts set recorded_at = created_at where recorded_at is null;
update public.media_assets set capture_source = case when path like 'demo/%' then 'demo' else 'camera' end
 where capture_source is null;

drop function if exists public.create_post(uuid, text, text, bigint, numeric, text, boolean, text);
create function public.create_post(
  p_place uuid,
  p_media_path text,
  p_mime text,
  p_size_bytes bigint,
  p_duration_s numeric,
  p_caption text,
  p_accept_policies boolean,
  p_thumb_path text default null,
  p_recorded_at timestamptz default null,
  p_capture text default null
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
  v_max_s int := public.config_int('video_max_seconds', 20);
  v_max_mb int := public.config_int('video_max_mb', 60);
  v_max_age int := public.config_int('max_record_age_minutes', 10);
begin
  if v_uid is null then raise exception 'Entre na sua conta para publicar'; end if;
  if (select status from profiles where id = v_uid) <> 'active' then raise exception 'Conta suspensa'; end if;
  if not coalesce(p_accept_policies, false) then raise exception 'É preciso aceitar as políticas de publicação'; end if;
  if not exists (select 1 from places where id = p_place and status = 'active') then
    raise exception 'Escolha um lugar do catálogo';
  end if;

  -- só câmera do app, gravado agora
  if public.config_text('capture_mode', 'camera_only') = 'camera_only' and coalesce(p_capture, '') <> 'camera' then
    raise exception 'Grave o vídeo pela câmera do app';
  end if;
  if p_recorded_at is null then raise exception 'Grave o vídeo pela câmera do app'; end if;
  if p_recorded_at > now() + interval '2 minutes' then raise exception 'Horário da gravação inválido'; end if;
  if p_recorded_at < now() - make_interval(mins => v_max_age) then
    raise exception 'Esse vídeo foi gravado há mais de % min. Grave de novo para mostrar como está agora', v_max_age;
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

  insert into media_assets (owner, path, mime, size_bytes, duration_s, thumbnail_path, recorded_at, capture_source)
  values (v_uid, p_media_path, p_mime, p_size_bytes, p_duration_s, p_thumb_path, least(p_recorded_at, now()), 'camera')
  returning id into v_media;

  if public.config_text('moderation_mode', 'manual') = 'auto' then v_status := 'published'; end if;

  insert into posts (author, place_id, media_id, caption, origin, status, recorded_at, published_at)
  values (v_uid, p_place, v_media, nullif(trim(p_caption), ''), v_origin, v_status, least(p_recorded_at, now()),
          case when v_status = 'published' then now() end)
  returning id into v_post;

  return query select v_post, v_status;
end;
$$;
revoke execute on function public.create_post(uuid, text, text, bigint, numeric, text, boolean, text, timestamptz, text) from public, anon;
grant execute on function public.create_post(uuid, text, text, bigint, numeric, text, boolean, text, timestamptz, text) to authenticated;

-- janela de frescor conta da gravação
create or replace function public.posts_fresh_from_sent()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.status = 'published' and (tg_op = 'INSERT' or old.status is distinct from 'published')
     and (tg_op = 'INSERT' or old.published_at is null) then
    new.fresh_until := coalesce(new.recorded_at, new.created_at)
                       + make_interval(mins => public.config_int('fresh_minutes', 60));
  end if;
  return new;
end;
$$;

-- demo: gravação acompanha os horários relativos a agora
create or replace function public.demo_refresh()
returns void language sql security definer set search_path = public as $$
  update posts p
     set created_at = now() - make_interval(mins => d.ago_min),
         recorded_at = now() - make_interval(mins => d.ago_min),
         published_at = now() - make_interval(mins => d.ago_min),
         fresh_until = now() - make_interval(mins => d.ago_min) + make_interval(mins => public.config_int('fresh_minutes', 60))
    from demo_posts d
   where d.post_id = p.id;
$$;
revoke execute on function public.demo_refresh() from public, anon, authenticated;

-- feed, página do lugar e tela cheia: idade conta da gravação
create or replace function public.feed_ranked(
  p_lat double precision,
  p_lng double precision,
  p_radius_m int default 15000,
  p_mode text default 'agora',
  p_category public.place_category default null,
  p_as_of timestamptz default null,
  p_offset int default 0,
  p_limit int default 10,
  p_seen uuid[] default '{}'
)
returns table (
  id uuid, caption text, origin public.post_origin, sponsored boolean,
  published_at timestamptz, sent_at timestamptz, fresh_until timestamptz, is_fresh boolean,
  media_path text, media_mime text, thumb_path text,
  place_id uuid, place_name text, place_category public.place_category, place_neighborhood text,
  author_username text, distance_m double precision,
  place_recent_posts int, place_recent_authors int,
  score double precision, rank_pos int, as_of timestamptz, server_now timestamptz
)
language sql stable security definer set search_path = public, extensions as $$
  with cfg as (
    select
      least(coalesce(p_as_of, now()), now()) as t,
      case when p_mode = 'agora' then config_num('rank_half_life_agora_min', 30)
           else config_num('rank_half_life_hoje_min', 180) end as half_life,
      config_num('rank_distance_half_km', 3) as dist_half,
      config_num('rank_momentum_weight', 0.35) as w_mom,
      config_num('rank_engagement_weight', 0.12) as w_eng,
      config_num('rank_engagement_cap', 1.4) as eng_cap,
      config_num('rank_origin_creator', 1.05) as o_creator,
      config_num('rank_origin_establishment', 0.85) as o_estab,
      config_num('rank_seen_factor', 0.35) as seen_f,
      config_num('rank_same_place_decay', 0.45) as place_decay,
      config_num('rank_same_author_decay', 0.6) as author_decay,
      config_int('sponsored_first_slot', 3) as sp_first,
      greatest(config_int('sponsored_every', 6), 2) as sp_every,
      st_setsrid(st_makepoint(p_lng, p_lat), 4326)::geography as here
  ),
  cand as (
    select p.id, p.caption, p.origin, p.sponsored, p.published_at, coalesce(p.recorded_at, p.created_at) as sent_at, p.fresh_until, p.author,
           m.path as media_path, m.mime as media_mime, m.thumbnail_path as thumb_path,
           l.id as place_id, l.name as place_name, l.category as place_category, l.neighborhood as place_neighborhood,
           pr.username as author_username,
           st_distance(l.location, c.here) as distance_m
    from cfg c
    join posts p on p.status = 'published' and p.published_at <= c.t
    join places l on l.id = p.place_id and l.status = 'active'
    join media_assets m on m.id = p.media_id
    join profiles pr on pr.id = p.author
    where st_dwithin(l.location, c.here, p_radius_m)
      and (p_category is null or l.category = p_category)
      and case p_mode
            when 'agora' then p.fresh_until > c.t
            when 'hoje' then coalesce(p.recorded_at, p.created_at) >= date_trunc('day', c.t at time zone 'America/Sao_Paulo') at time zone 'America/Sao_Paulo'
            else coalesce(p.recorded_at, p.created_at) > c.t - interval '7 days'
          end
    -- teto de candidatos: com meia-vida de horas, vídeo além dos 600 mais novos nunca chega ao topo
    order by coalesce(p.recorded_at, p.created_at) desc
    limit 600
  ),
  -- movimento: quantas pessoas diferentes publicaram no lugar na última hora (antes do instante da foto)
  mom as (
    select p.place_id, count(*)::int as posts, count(distinct p.author)::int as authors
    from posts p, cfg c
    where p.status = 'published' and p.place_id in (select place_id from cand)
      and p.published_at > c.t - interval '60 minutes' and p.published_at <= c.t
    group by p.place_id
  ),
  -- engajamento do vídeo nas últimas 24 h (até o instante da foto)
  eng as (
    select e.post_id,
           count(*) filter (where e.event_name = 'post_complete') as completes,
           count(*) filter (where e.event_name in ('place_save', 'route_click', 'share_click')) as intents
    from analytics_events e, cfg c
    where e.post_id in (select id from cand)
      and e.created_at > c.t - interval '24 hours' and e.created_at <= c.t
    group by e.post_id
  ),
  rep as (
    select r.post_id, count(*)::int as open_reports
    from reports r
    where r.status = 'open' and r.post_id in (select id from cand)
    group by r.post_id
  ),
  scored as (
    select k.*,
           coalesce(mo.posts, 0) as place_recent_posts,
           coalesce(mo.authors, 0) as place_recent_authors,
           -- idade conta do envio (não da aprovação): fila de moderação não "rejuvenesce" o vídeo
           exp(-ln(2) * greatest(extract(epoch from c.t - k.sent_at) / 60, 0) / c.half_life)
           * (1 / (1 + (k.distance_m / 1000) / c.dist_half))
           * (1 + c.w_mom * ln(greatest(coalesce(mo.authors, 1), 1)))
           * least(1 + c.w_eng * ln(1 + coalesce(en.completes, 0) + coalesce(en.intents, 0)), c.eng_cap)
           * case k.origin when 'creator' then c.o_creator when 'establishment' then c.o_estab else 1 end
           * power(0.5, coalesce(rp.open_reports, 0))
           * case when k.id = any (coalesce(p_seen, '{}')) then c.seen_f else 1 end
             as base_score
    from cand k cross join cfg c
    left join mom mo on mo.place_id = k.place_id
    left join eng en on en.post_id = k.id
    left join rep rp on rp.post_id = k.id
  ),
  -- diversidade: penaliza o 2º, 3º... vídeo do mesmo lugar e do mesmo autor
  organic as (
    select s.*,
           s.base_score
           * power(c.place_decay, row_number() over (partition by s.place_id order by s.base_score desc, s.id) - 1)
           * power(c.author_decay, row_number() over (partition by s.author order by s.base_score desc, s.id) - 1)
             as final_score
    from scored s cross join cfg c
    where not s.sponsored
  ),
  organic_ranked as (
    select o.*, row_number() over (order by o.final_score desc, o.sent_at desc, o.id) as pos
    from organic o
  ),
  sponsored_ranked as (
    select s.*, s.base_score as final_score,
           row_number() over (order by s.base_score desc, s.id) as k
    from (
      select sc.*, row_number() over (partition by sc.place_id order by sc.base_score desc, sc.id) as per_place
      from scored sc where sc.sponsored
    ) s
    where s.per_place = 1
  ),
  merged as (
    select o.id, o.caption, o.origin, o.sponsored, o.published_at, o.sent_at, o.fresh_until, o.media_path, o.media_mime,
           o.thumb_path, o.place_id, o.place_name, o.place_category, o.place_neighborhood, o.author_username,
           o.distance_m, o.place_recent_posts, o.place_recent_authors, o.final_score,
           o.pos::double precision as sort_key
    from organic_ranked o
    union all
    select s.id, s.caption, s.origin, s.sponsored, s.published_at, s.sent_at, s.fresh_until, s.media_path, s.media_mime,
           s.thumb_path, s.place_id, s.place_name, s.place_category, s.place_neighborhood, s.author_username,
           s.distance_m, s.place_recent_posts, s.place_recent_authors, s.final_score,
           -- k-ésimo patrocinado vai na posição final primeiro_slot + (k-1)·N; antes dele há (posição - k) orgânicos.
           -- Nunca antes do 1º orgânico; se faltar orgânico, vai para o fim.
           least(greatest(c.sp_first + (s.k - 1) * c.sp_every - s.k, 1),
                 greatest((select count(*) from organic_ranked), 1))::double precision + 0.5
    from sponsored_ranked s cross join cfg c
  ),
  final as (
    select m.*, row_number() over (order by m.sort_key, m.id)::int as rank_pos from merged m
  )
  select f.id, f.caption, f.origin, f.sponsored, f.published_at, f.sent_at, f.fresh_until,
         (f.fresh_until > now()) as is_fresh,
         f.media_path, f.media_mime, f.thumb_path, f.place_id, f.place_name, f.place_category, f.place_neighborhood,
         f.author_username, f.distance_m, f.place_recent_posts, f.place_recent_authors,
         round(f.final_score::numeric, 6)::double precision, f.rank_pos, (select t from cfg), now()
  from final f
  order by f.rank_pos
  offset greatest(coalesce(p_offset, 0), 0)
  limit least(greatest(coalesce(p_limit, 10), 1), 50);
$$;

revoke execute on function public.feed_ranked(double precision, double precision, int, text, public.place_category, timestamptz, int, int, uuid[]) from public;
grant execute on function public.feed_ranked(double precision, double precision, int, text, public.place_category, timestamptz, int, int, uuid[]) to anon, authenticated;

drop function if exists public.place_posts(uuid, int);
create function public.place_posts(p_place uuid, p_limit int default 20)
returns table (
  id uuid, caption text, origin public.post_origin, sponsored boolean,
  published_at timestamptz, sent_at timestamptz, fresh_until timestamptz, is_fresh boolean,
  media_path text, media_mime text, thumb_path text, author_username text
)
language sql stable security definer set search_path = public as $$
  select p.id, p.caption, p.origin, p.sponsored, p.published_at, coalesce(p.recorded_at, p.created_at), p.fresh_until, (p.fresh_until > now()),
         m.path, m.mime, m.thumbnail_path, pr.username
  from posts p
  join media_assets m on m.id = p.media_id
  join profiles pr on pr.id = p.author
  join places l on l.id = p.place_id and l.status = 'active'
  where p.place_id = p_place and p.status = 'published'
  order by coalesce(p.recorded_at, p.created_at) desc
  limit least(greatest(p_limit, 1), 50);
$$;
revoke execute on function public.place_posts(uuid, int) from public;
grant execute on function public.place_posts(uuid, int) to anon, authenticated;

drop function if exists public.post_detail(uuid);
create function public.post_detail(p_post uuid)
returns table (
  id uuid, caption text, origin public.post_origin, sponsored boolean,
  published_at timestamptz, sent_at timestamptz, fresh_until timestamptz, is_fresh boolean,
  media_path text, media_mime text, thumb_path text,
  place_id uuid, place_name text, place_category public.place_category, place_neighborhood text,
  place_address text, lat double precision, lng double precision, author_username text
)
language sql stable security definer set search_path = public, extensions as $$
  select p.id, p.caption, p.origin, p.sponsored, p.published_at, coalesce(p.recorded_at, p.created_at), p.fresh_until, (p.fresh_until > now()),
         m.path, m.mime, m.thumbnail_path, l.id, l.name, l.category, l.neighborhood, l.address,
         st_y(l.location::geometry), st_x(l.location::geometry), pr.username
  from posts p
  join places l on l.id = p.place_id and l.status = 'active'
  join media_assets m on m.id = p.media_id
  join profiles pr on pr.id = p.author
  where p.id = p_post and p.status = 'published';
$$;
revoke execute on function public.post_detail(uuid) from public;
grant execute on function public.post_detail(uuid) to anon, authenticated;

select public.demo_refresh() where exists (select 1 from public.demo_posts);
