-- Cola Aqui · Ordem do feed (relevância) — 23/10/2026
--
-- Quem aparece primeiro e por quê. A promessa do app é "como o lugar está agora", então o
-- tempo desde a publicação manda; o resto só reordena vídeos de idade parecida.
--
--   pontuação = frescor × distância × movimento do lugar × engajamento × origem × denúncias × já visto
--
--   frescor     meia-vida de 30 min no "Agora" e 3 h no "Hoje": um vídeo de 30 min vale metade de um novo
--   distância   1 / (1 + km/3): a 3 km vale metade de um vizinho; nunca zera (a região já limita o raio)
--   movimento   1 + 0,35·ln(pessoas diferentes que publicaram no lugar na última hora): 3 pessoas ≈ +38 %
--   engajamento 1 + 0,12·ln(1 + vistos até o fim + intenções), no máximo +40 %; com pouco dado quase não pesa
--   origem      usuário 1,00 · criador 1,05 · estabelecimento 0,85 (post orgânico do lugar é autopromoção)
--   denúncias   × 0,5 por denúncia aberta (3 denúncias já escondem o post)
--   já visto    × 0,35 para o que a pessoa já assistiu neste aparelho
--
-- Diversidade: o 2º vídeo do mesmo lugar vale 45 % e o 3º 20 %; o 2º do mesmo autor vale 60 %.
-- Patrocinado: fora da disputa orgânica, entra na posição 3 e depois a cada 6, no máximo 1 por lugar,
-- sempre com selo; nunca abre o feed.
-- Estabilidade: a pessoa recebe uma "foto" do feed (p_as_of). As páginas seguintes usam o mesmo
-- instante, então a lista não pula enquanto ela rola; vídeos novos aparecem num aviso "N novos".
-- Todos os pesos ficam em app_config e podem ser ajustados sem publicar o app.

create extension if not exists unaccent schema extensions;

create or replace function public.config_num(p_key text, p_default double precision)
returns double precision language sql stable set search_path = public as $$
  select coalesce((select (value #>> '{}')::double precision from app_config where key = p_key), p_default);
$$;
grant execute on function public.config_num(text, double precision) to anon, authenticated;

insert into public.app_config (key, value, description) values
  ('rank_half_life_agora_min', '30', 'Meia-vida do frescor no feed Agora (min)'),
  ('rank_half_life_hoje_min', '180', 'Meia-vida do frescor no feed Hoje (min)'),
  ('rank_distance_half_km', '3', 'Distância em que o peso cai pela metade (km)'),
  ('rank_momentum_weight', '0.35', 'Peso de várias pessoas publicando no mesmo lugar na última hora'),
  ('rank_engagement_weight', '0.12', 'Peso de engajamento (vistos até o fim, salvar, rota, compartilhar)'),
  ('rank_engagement_cap', '1.4', 'Teto do bônus de engajamento'),
  ('rank_origin_creator', '1.05', 'Peso de posts de criador'),
  ('rank_origin_establishment', '0.85', 'Peso de posts orgânicos do próprio estabelecimento'),
  ('rank_seen_factor', '0.35', 'Peso de posts que a pessoa já viu'),
  ('rank_same_place_decay', '0.45', 'Multiplicador para cada vídeo extra do mesmo lugar'),
  ('rank_same_author_decay', '0.6', 'Multiplicador para cada vídeo extra do mesmo autor'),
  ('sponsored_first_slot', '3', 'Posição do primeiro patrocinado'),
  ('sponsored_every', '6', 'Intervalo entre patrocinados')
on conflict (key) do nothing;

-- índice para sinais de engajamento por post e janela de tempo
create index if not exists posts_sent_idx on public.posts (created_at desc) where status = 'published';
create index if not exists analytics_post_time_idx on public.analytics_events (post_id, created_at) where post_id is not null;
create index if not exists reports_open_post_idx on public.reports (post_id) where status = 'open' and post_id is not null;

-- relógio do servidor: o app corrige o relógio do celular (rótulo "há X min" sempre certo)
create or replace function public.server_time()
returns timestamptz language sql stable as $$ select now() $$;
grant execute on function public.server_time() to anon, authenticated;

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
    select p.id, p.caption, p.origin, p.sponsored, p.published_at, p.created_at as sent_at, p.fresh_until, p.author,
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
            when 'hoje' then p.created_at >= date_trunc('day', c.t at time zone 'America/Sao_Paulo') at time zone 'America/Sao_Paulo'
            else p.created_at > c.t - interval '7 days'
          end
    -- teto de candidatos: com meia-vida de horas, vídeo além dos 600 mais novos nunca chega ao topo
    order by p.created_at desc
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

-- quantos vídeos novos desde a foto do feed (aviso "3 vídeos novos", sem embaralhar a lista)
create or replace function public.feed_new_count(
  p_lat double precision,
  p_lng double precision,
  p_radius_m int,
  p_category public.place_category,
  p_since timestamptz
)
returns int language sql stable security definer set search_path = public, extensions as $$
  select count(*)::int
  from posts p
  join places l on l.id = p.place_id and l.status = 'active'
  where p.status = 'published' and not p.sponsored
    and p.published_at > p_since and p.published_at <= now()
    and st_dwithin(l.location, st_setsrid(st_makepoint(p_lng, p_lat), 4326)::geography, p_radius_m)
    and (p_category is null or l.category = p_category);
$$;
revoke execute on function public.feed_new_count(double precision, double precision, int, public.place_category, timestamptz) from public;
grant execute on function public.feed_new_count(double precision, double precision, int, public.place_category, timestamptz) to anon, authenticated;

-- Lugares (Mapa, busca, feed vazio): primeiro onde tem movimento agora, depois o mais perto.
-- Busca ignora acento e maiúsculas e procura também no bairro ("lago", "asa norte", "cafe").
drop function if exists public.places_nearby(double precision, double precision, int, public.place_category, text, int);
create function public.places_nearby(
  p_lat double precision,
  p_lng double precision,
  p_radius_m int default 15000,
  p_category public.place_category default null,
  p_search text default null,
  p_limit int default 100
)
returns table (
  id uuid, name text, category public.place_category, neighborhood text, address text,
  is_founder boolean, lat double precision, lng double precision, distance_m double precision,
  fresh_posts bigint, last_published_at timestamptz, recent_authors bigint
)
language sql stable security definer set search_path = public, extensions as $$
  with q as (
    select nullif(lower(unaccent(trim(coalesce(p_search, '')))), '') as term,
           st_setsrid(st_makepoint(p_lng, p_lat), 4326)::geography as here
  ),
  base as (
    select l.id, l.name, l.category, l.neighborhood, l.address, l.is_founder,
           st_y(l.location::geometry) as lat, st_x(l.location::geometry) as lng,
           st_distance(l.location, q.here) as distance_m,
           count(p.id) filter (where p.fresh_until > now()) as fresh_posts,
           max(p.published_at) as last_published_at,
           count(distinct p.author) filter (where p.published_at > now() - interval '60 minutes') as recent_authors,
           q.term,
           lower(unaccent(l.name)) as n_name,
           lower(unaccent(coalesce(l.neighborhood, ''))) as n_hood
    from places l
    cross join q
    left join posts p on p.place_id = l.id and p.status = 'published'
    where l.status = 'active'
      -- com busca, procura em toda a cidade; sem busca, respeita o raio da região
      and (q.term is not null or st_dwithin(l.location, q.here, p_radius_m))
      and (p_category is null or l.category = p_category)
    group by l.id, q.here, q.term
  )
  select b.id, b.name, b.category, b.neighborhood, b.address, b.is_founder, b.lat, b.lng, b.distance_m,
         b.fresh_posts, b.last_published_at, b.recent_authors
  from base b
  where b.term is null or b.n_name like '%' || b.term || '%' or b.n_hood like '%' || b.term || '%'
  order by
    -- na busca: nome que começa com o termo vem antes
    case when b.term is not null and b.n_name like b.term || '%' then 0
         when b.term is not null and b.n_name like '%' || b.term || '%' then 1
         when b.term is not null then 2 else 0 end,
    (b.fresh_posts > 0) desc,
    case when b.fresh_posts > 0
         then (1 + 0.35 * ln(greatest(b.recent_authors, 1))) / (1 + (b.distance_m / 1000) / 3) end desc nulls last,
    b.distance_m asc
  limit least(greatest(p_limit, 1), 200);
$$;
revoke execute on function public.places_nearby(double precision, double precision, int, public.place_category, text, int) from public;
grant execute on function public.places_nearby(double precision, double precision, int, public.place_category, text, int) to anon, authenticated;

-- página do lugar e tela cheia passam a devolver fresh_until (o ponto "recente" apaga na hora certa no app)
drop function if exists public.place_posts(uuid, int);
create function public.place_posts(p_place uuid, p_limit int default 20)
returns table (
  id uuid, caption text, origin public.post_origin, sponsored boolean,
  published_at timestamptz, sent_at timestamptz, fresh_until timestamptz, is_fresh boolean,
  media_path text, media_mime text, thumb_path text, author_username text
)
language sql stable security definer set search_path = public as $$
  select p.id, p.caption, p.origin, p.sponsored, p.published_at, p.created_at, p.fresh_until, (p.fresh_until > now()),
         m.path, m.mime, m.thumbnail_path, pr.username
  from posts p
  join media_assets m on m.id = p.media_id
  join profiles pr on pr.id = p.author
  join places l on l.id = p.place_id and l.status = 'active'
  where p.place_id = p_place and p.status = 'published'
  order by p.created_at desc
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
  select p.id, p.caption, p.origin, p.sponsored, p.published_at, p.created_at, p.fresh_until, (p.fresh_until > now()),
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

-- ---------- janela de frescor conta do envio ----------
-- Antes: aprovar um vídeo 40 min depois o deixava 60 min no "Agora" como se fosse novo.
-- Agora: fresh_until = envio + janela. Aprovado tarde, fica só o que sobrou da hora (ou vai direto para "Hoje").
create or replace function public.posts_fresh_from_sent()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.status = 'published' and (tg_op = 'INSERT' or old.status is distinct from 'published')
     and (tg_op = 'INSERT' or old.published_at is null) then
    new.fresh_until := new.created_at + make_interval(mins => public.config_int('fresh_minutes', 60));
  end if;
  return new;
end;
$$;
drop trigger if exists posts_fresh_from_sent on public.posts;
create trigger posts_fresh_from_sent before insert or update of status on public.posts
  for each row execute function public.posts_fresh_from_sent();

-- posts já publicados: alinha a janela com o envio
update public.posts set fresh_until = created_at + make_interval(mins => public.config_int('fresh_minutes', 60))
 where status = 'published' and fresh_until is distinct from created_at + make_interval(mins => public.config_int('fresh_minutes', 60));

-- demo: envio e publicação no mesmo instante
create or replace function public.demo_refresh()
returns void language sql security definer set search_path = public as $$
  update posts p
     set created_at = now() - make_interval(mins => d.ago_min),
         published_at = now() - make_interval(mins => d.ago_min),
         fresh_until = now() - make_interval(mins => d.ago_min) + make_interval(mins => public.config_int('fresh_minutes', 60))
    from demo_posts d
   where d.post_id = p.id;
$$;
revoke execute on function public.demo_refresh() from public, anon, authenticated;
select public.demo_refresh() where exists (select 1 from public.demo_posts);
