-- Cola Aqui · esquema do MVP (P0), alinhado ao PRD v1.0 de 22/10/2026.
-- Referências entre parênteses apontam para o PRD (RF = requisito funcional, QA = caso de aceite).
--
-- Princípios que vivem no banco:
--   * visitante (anon) explora feed, mapa e lugares sem conta (RF-01, QA-01)
--   * "recente" = publicado nos últimos N minutos; N fica em app_config (5.2, hipótese inicial 60)
--   * nada aparece em público antes da moderação (RF-07, QA-05)
--   * origem sempre explícita: usuário, criador ou estabelecimento; patrocínio sinalizado (5.1, 5.3, QA-09)
--   * coordenadas de usuários nunca são gravadas nos posts (5.5)
--   * gestor só altera lugares da própria organização, após reivindicação aprovada (RF-10, RF-11, QA-07, QA-08)
--   * decisões de moderação e reivindicação ficam auditadas (RF-11, RF-12, QA-10)

create extension if not exists postgis with schema extensions;

-- =========================================================
-- Tipos
-- =========================================================
create type public.place_category as enum (
  'bar', 'restaurante', 'balada', 'casa_de_show', 'festa', 'evento',
  'feira', 'cultura', 'esporte', 'atletica', 'cafe', 'outro'
);
create type public.user_role as enum ('user', 'creator', 'moderator', 'admin');
create type public.post_origin as enum ('user', 'creator', 'establishment');
create type public.post_status as enum ('pending_review', 'published', 'rejected', 'hidden', 'removed');
create type public.partner_role as enum ('owner', 'editor');
create type public.claim_status as enum ('pending', 'approved', 'rejected');
create type public.report_status as enum ('open', 'actioned', 'dismissed');

-- =========================================================
-- Configuração remota (parâmetros ajustáveis sem nova versão do app)
-- =========================================================
create table public.app_config (
  key text primary key,
  value jsonb not null,
  description text,
  updated_at timestamptz not null default now()
);

create or replace function public.config_int(p_key text, p_default int)
returns int language sql stable set search_path = public as $$
  select coalesce((select (value #>> '{}')::int from app_config where key = p_key), p_default);
$$;

create or replace function public.config_text(p_key text, p_default text)
returns text language sql stable set search_path = public as $$
  select coalesce((select value #>> '{}' from app_config where key = p_key), p_default);
$$;

-- =========================================================
-- Regiões (seleção manual quando o GPS é negado — RF-01, RF-04, QA-02)
-- =========================================================
create table public.regions (
  slug text primary key,
  name text not null,
  center extensions.geography(Point, 4326) not null,
  radius_m int not null default 5000,
  sort int not null default 100,
  active boolean not null default true
);

-- =========================================================
-- Pessoas
-- =========================================================
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  username text unique not null check (username ~ '^[a-z0-9_.]{3,24}$'),
  display_name text check (char_length(display_name) <= 60),
  avatar_url text,
  role public.user_role not null default 'user',
  status text not null default 'active' check (status in ('active', 'suspended')),
  created_at timestamptz not null default now()
);

-- dados privados: nunca públicos (RF-09)
create table public.user_preferences (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  region_slug text references public.regions (slug),
  birthdate date,
  analytics_consent boolean not null default true,
  marketing_consent boolean not null default false,
  terms_accepted_at timestamptz,
  updated_at timestamptz not null default now()
);

create table public.account_deletion_requests (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  requested_at timestamptz not null default now(),
  status text not null default 'pending' check (status in ('pending', 'done'))
);

-- =========================================================
-- Organizações e parceiros (Cola Parceiros)
-- =========================================================
create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  document text,
  verification_status text not null default 'verified' check (verification_status in ('pending', 'verified', 'suspended')),
  created_at timestamptz not null default now()
);

create table public.partner_members (
  organization_id uuid references public.organizations (id) on delete cascade,
  user_id uuid references public.profiles (id) on delete cascade,
  role public.partner_role not null default 'owner',
  created_at timestamptz not null default now(),
  primary key (organization_id, user_id)
);

-- =========================================================
-- Lugares
-- =========================================================
create table public.places (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations (id) on delete set null,
  name text not null,
  category public.place_category not null default 'bar',
  address text,
  neighborhood text,
  region_slug text references public.regions (slug),
  location extensions.geography(Point, 4326) not null,
  phone text,
  instagram text,
  website text,
  cover_url text,
  is_founder boolean not null default false,
  status text not null default 'active' check (status in ('active', 'hidden', 'suspended')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index places_location_idx on public.places using gist (location);
create index places_region_idx on public.places (region_slug) where status = 'active';

create table public.place_hours (
  id uuid primary key default gen_random_uuid(),
  place_id uuid not null references public.places (id) on delete cascade,
  weekday smallint not null check (weekday between 0 and 6), -- 0 = domingo
  opens time not null,
  closes time not null,
  updated_by uuid references public.profiles (id) on delete set null,
  updated_at timestamptz not null default now()
);
create index place_hours_place_idx on public.place_hours (place_id, weekday);

create table public.place_events (
  id uuid primary key default gen_random_uuid(),
  place_id uuid not null references public.places (id) on delete cascade,
  title text not null check (char_length(title) <= 100),
  description text check (char_length(description) <= 500),
  starts_at timestamptz not null,
  ends_at timestamptz,
  ticket_url text,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);
create index place_events_place_idx on public.place_events (place_id, starts_at);

create table public.place_claims (
  id uuid primary key default gen_random_uuid(),
  place_id uuid not null references public.places (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  org_name text not null,
  contact text not null,
  evidence text,
  status public.claim_status not null default 'pending',
  decided_by uuid references public.profiles (id) on delete set null,
  decided_at timestamptz,
  decision_note text,
  created_at timestamptz not null default now()
);
create unique index place_claims_one_open on public.place_claims (place_id, user_id) where status = 'pending';

-- =========================================================
-- Mídia e publicações
-- =========================================================
create table public.media_assets (
  id uuid primary key default gen_random_uuid(),
  owner uuid not null references public.profiles (id) on delete cascade,
  path text not null unique,
  mime text not null,
  size_bytes bigint,
  duration_s numeric(5, 1),
  status text not null default 'uploaded' check (status in ('uploaded', 'ready', 'failed')),
  thumbnail_path text,
  created_at timestamptz not null default now()
);

create table public.posts (
  id uuid primary key default gen_random_uuid(),
  author uuid not null references public.profiles (id) on delete cascade,
  place_id uuid not null references public.places (id) on delete cascade,
  media_id uuid not null references public.media_assets (id) on delete cascade,
  caption text check (char_length(caption) <= 140),
  origin public.post_origin not null default 'user',
  sponsored boolean not null default false,
  status public.post_status not null default 'pending_review',
  created_at timestamptz not null default now(),   -- envio
  published_at timestamptz,                        -- servidor, ao aprovar (7.3)
  fresh_until timestamptz,                         -- published_at + janela de frescor
  moderated_by uuid references public.profiles (id) on delete set null,
  moderated_at timestamptz,
  moderation_note text
);
create index posts_public_idx on public.posts (place_id, published_at desc) where status = 'published';
create index posts_feed_idx on public.posts (published_at desc) where status = 'published';
create index posts_author_idx on public.posts (author, created_at desc);
create index posts_review_idx on public.posts (created_at) where status = 'pending_review';

create table public.place_saves (
  user_id uuid references public.profiles (id) on delete cascade,
  place_id uuid references public.places (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, place_id)
);

-- =========================================================
-- Moderação, auditoria e analytics
-- =========================================================
create table public.reports (
  id uuid primary key default gen_random_uuid(),
  reporter uuid not null references public.profiles (id) on delete cascade,
  post_id uuid references public.posts (id) on delete cascade,
  place_id uuid references public.places (id) on delete cascade,
  reason text not null check (reason in ('inadequado', 'falso', 'spam', 'menor_de_idade', 'violencia', 'direitos', 'outro')),
  details text check (char_length(details) <= 500),
  status public.report_status not null default 'open',
  created_at timestamptz not null default now(),
  check ((post_id is not null) <> (place_id is not null))
);
create unique index reports_one_per_post on public.reports (reporter, post_id) where post_id is not null;
create unique index reports_one_per_place on public.reports (reporter, place_id) where place_id is not null;

create table public.moderation_actions (
  id uuid primary key default gen_random_uuid(),
  moderator uuid references public.profiles (id) on delete set null,
  target_type text not null,
  target_id uuid not null,
  action text not null,
  reason text,
  created_at timestamptz not null default now()
);

create table public.audit_logs (
  id bigint generated always as identity primary key,
  actor uuid references public.profiles (id) on delete set null,
  action text not null,
  object_type text not null,
  object_id uuid,
  context jsonb not null default '{}',
  created_at timestamptz not null default now()
);

create table public.analytics_events (
  id bigint generated always as identity primary key,
  event_name text not null check (event_name in (
    'feed_item_impression', 'place_view', 'post_play', 'post_complete',
    'place_save', 'share_click', 'route_click', 'post_published', 'partner_offer_redeemed'
  )),
  user_id uuid references public.profiles (id) on delete set null,
  anon_id text,
  place_id uuid references public.places (id) on delete cascade,
  post_id uuid references public.posts (id) on delete cascade,
  props jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create index analytics_place_idx on public.analytics_events (place_id, event_name, created_at);
create index analytics_dedupe_idx on public.analytics_events (event_name, post_id, created_at);

-- =========================================================
-- Funções de apoio a permissões
-- =========================================================
create or replace function public.my_role()
returns public.user_role language sql stable security definer set search_path = public as $$
  select coalesce((select role from profiles where id = auth.uid()), 'user'::user_role);
$$;

create or replace function public.is_moderator()
returns boolean language sql stable security definer set search_path = public as $$
  select auth.uid() is not null and public.my_role() in ('moderator', 'admin');
$$;

create or replace function public.can_manage_place(p_place uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from places pl
    join partner_members pm on pm.organization_id = pl.organization_id
    join organizations o on o.id = pl.organization_id
    where pl.id = p_place and pm.user_id = auth.uid() and o.verification_status = 'verified'
  );
$$;

create or replace function public.audit(p_action text, p_type text, p_id uuid, p_ctx jsonb default '{}')
returns void language sql security definer set search_path = public as $$
  insert into audit_logs (actor, action, object_type, object_id, context)
  values (auth.uid(), p_action, p_type, p_id, coalesce(p_ctx, '{}'));
$$;

-- conta nova → perfil + preferências privadas; contas só 18+
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_birth date := nullif(new.raw_user_meta_data ->> 'birthdate', '')::date;
  v_user text := lower(coalesce(nullif(new.raw_user_meta_data ->> 'username', ''),
                                'user_' || substr(new.id::text, 1, 8)));
begin
  if v_birth is not null and v_birth > (current_date - interval '18 years') then
    raise exception 'Cola Aqui: conta só para maiores de 18 anos';
  end if;
  insert into profiles (id, username, display_name) values (new.id, v_user, new.raw_user_meta_data ->> 'display_name');
  insert into user_preferences (user_id, birthdate, terms_accepted_at)
  values (new.id, v_birth, case when (new.raw_user_meta_data ->> 'terms') = 'true' then now() end);
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- =========================================================
-- RLS
-- =========================================================
alter table public.app_config enable row level security;
alter table public.regions enable row level security;
alter table public.profiles enable row level security;
alter table public.user_preferences enable row level security;
alter table public.account_deletion_requests enable row level security;
alter table public.organizations enable row level security;
alter table public.partner_members enable row level security;
alter table public.places enable row level security;
alter table public.place_hours enable row level security;
alter table public.place_events enable row level security;
alter table public.place_claims enable row level security;
alter table public.media_assets enable row level security;
alter table public.posts enable row level security;
alter table public.place_saves enable row level security;
alter table public.reports enable row level security;
alter table public.moderation_actions enable row level security;
alter table public.audit_logs enable row level security;
alter table public.analytics_events enable row level security;

-- leitura pública (visitante)
create policy "config pública" on public.app_config for select to anon, authenticated using (true);
create policy "regiões públicas" on public.regions for select to anon, authenticated using (active);
create policy "perfis públicos" on public.profiles for select to anon, authenticated using (status = 'active' or id = auth.uid());
create policy "lugares públicos" on public.places for select to anon, authenticated
  using (status = 'active' or public.is_moderator() or public.can_manage_place(id));
create policy "horários públicos" on public.place_hours for select to anon, authenticated using (true);
create policy "programação pública" on public.place_events for select to anon, authenticated using (true);
create policy "posts publicados ou meus" on public.posts for select to anon, authenticated
  using (status = 'published' or author = auth.uid() or public.is_moderator());

-- perfil: cada um edita só campos públicos do próprio perfil (papel não)
revoke update on public.profiles from authenticated, anon;
grant update (username, display_name, avatar_url) on public.profiles to authenticated;
create policy "edito meu perfil" on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

create policy "minhas preferências" on public.user_preferences for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "meu pedido de exclusão" on public.account_deletion_requests for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- parceiros
create policy "vejo minhas organizações" on public.organizations for select to authenticated
  using (public.is_moderator() or exists (select 1 from partner_members m where m.organization_id = id and m.user_id = auth.uid()));
create policy "vejo meus vínculos" on public.partner_members for select to authenticated
  using (user_id = auth.uid() or public.is_moderator());

revoke update on public.places from authenticated, anon;
grant update (name, category, address, neighborhood, phone, instagram, website, cover_url, updated_at) on public.places to authenticated;
create policy "gestor edita dados oficiais" on public.places for update to authenticated
  using (public.can_manage_place(id) or public.is_moderator())
  with check (public.can_manage_place(id) or public.is_moderator());
create policy "moderação cadastra lugar" on public.places for insert to authenticated with check (public.is_moderator());

create policy "gestor cuida dos horários" on public.place_hours for all to authenticated
  using (public.can_manage_place(place_id) or public.is_moderator())
  with check (public.can_manage_place(place_id) or public.is_moderator());
create policy "gestor cuida da programação" on public.place_events for all to authenticated
  using (public.can_manage_place(place_id) or public.is_moderator())
  with check (public.can_manage_place(place_id) or public.is_moderator());

create policy "vejo minhas reivindicações" on public.place_claims for select to authenticated
  using (user_id = auth.uid() or public.is_moderator());

-- mídia e posts (inserção só pelas funções)
create policy "minha mídia" on public.media_assets for select to authenticated using (owner = auth.uid() or public.is_moderator());
create policy "apago meu post" on public.posts for delete to authenticated using (author = auth.uid());

create policy "meus salvos" on public.place_saves for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "minhas denúncias" on public.reports for select to authenticated using (reporter = auth.uid() or public.is_moderator());
create policy "moderação vê ações" on public.moderation_actions for select to authenticated using (public.is_moderator());
create policy "moderação vê auditoria" on public.audit_logs for select to authenticated using (public.is_moderator());
-- analytics: só escrita pela função track_event; leitura agregada por partner_analytics

-- =========================================================
-- Funções do app (RPC)
-- =========================================================

-- Regiões para o seletor manual (RF-01)
create or replace function public.list_regions()
returns table (slug text, name text, lat double precision, lng double precision, radius_m int)
language sql stable security definer set search_path = public, extensions as $$
  select slug, name, st_y(center::geometry), st_x(center::geometry), radius_m
  from regions where active order by sort, name;
$$;

-- Feed Explorar (RF-03): publicações aprovadas, paginadas por cursor, com estado de frescor.
create or replace function public.explore_feed(
  p_lat double precision,
  p_lng double precision,
  p_radius_m int default 15000,
  p_mode text default 'agora',          -- 'agora' (recentes) | 'hoje' | 'tudo'
  p_category public.place_category default null,
  p_before timestamptz default null,     -- cursor: published_at do último item
  p_limit int default 20
)
returns table (
  id uuid, caption text, origin public.post_origin, sponsored boolean,
  published_at timestamptz, is_fresh boolean, media_path text, media_mime text,
  place_id uuid, place_name text, place_category public.place_category, place_neighborhood text,
  author_username text, distance_m double precision
)
language sql stable security definer set search_path = public, extensions as $$
  select p.id, p.caption, p.origin, p.sponsored, p.published_at, (p.fresh_until > now()),
         m.path, m.mime, l.id, l.name, l.category, l.neighborhood, pr.username,
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

-- Mapa e busca por proximidade (RF-04)
create or replace function public.places_nearby(
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
  fresh_posts bigint, last_published_at timestamptz
)
language sql stable security definer set search_path = public, extensions as $$
  select l.id, l.name, l.category, l.neighborhood, l.address, l.is_founder,
         st_y(l.location::geometry), st_x(l.location::geometry),
         st_distance(l.location, st_setsrid(st_makepoint(p_lng, p_lat), 4326)::geography),
         count(p.id) filter (where p.fresh_until > now()),
         max(p.published_at)
  from places l
  left join posts p on p.place_id = l.id and p.status = 'published'
  where l.status = 'active'
    and st_dwithin(l.location, st_setsrid(st_makepoint(p_lng, p_lat), 4326)::geography, p_radius_m)
    and (p_category is null or l.category = p_category)
    and (p_search is null or l.name ilike '%' || p_search || '%')
  group by l.id
  order by count(p.id) filter (where p.fresh_until > now()) desc, 9 asc
  limit least(greatest(p_limit, 1), 200);
$$;

-- Perfil do lugar (RF-05)
create or replace function public.place_detail(p_place uuid)
returns table (
  id uuid, name text, category public.place_category, address text, neighborhood text,
  phone text, instagram text, website text, cover_url text, is_founder boolean,
  lat double precision, lng double precision, has_manager boolean, can_manage boolean,
  last_published_at timestamptz
)
language sql stable security definer set search_path = public, extensions as $$
  select l.id, l.name, l.category, l.address, l.neighborhood, l.phone, l.instagram, l.website,
         l.cover_url, l.is_founder, st_y(l.location::geometry), st_x(l.location::geometry),
         l.organization_id is not null, public.can_manage_place(l.id),
         (select max(published_at) from posts where place_id = l.id and status = 'published')
  from places l
  where l.id = p_place and (l.status = 'active' or public.is_moderator() or public.can_manage_place(l.id));
$$;

create or replace function public.place_posts(p_place uuid, p_limit int default 20)
returns table (
  id uuid, caption text, origin public.post_origin, sponsored boolean,
  published_at timestamptz, is_fresh boolean, media_path text, media_mime text, author_username text
)
language sql stable security definer set search_path = public as $$
  select p.id, p.caption, p.origin, p.sponsored, p.published_at, (p.fresh_until > now()),
         m.path, m.mime, pr.username
  from posts p
  join media_assets m on m.id = p.media_id
  join profiles pr on pr.id = p.author
  join places l on l.id = p.place_id and l.status = 'active'
  where p.place_id = p_place and p.status = 'published'
  order by p.published_at desc
  limit least(greatest(p_limit, 1), 50);
$$;

-- Publicação de experiência (RF-07): cria post pendente; nenhuma coordenada do usuário é gravada.
create or replace function public.create_post(
  p_place uuid,
  p_media_path text,
  p_mime text,
  p_size_bytes bigint,
  p_duration_s numeric,
  p_caption text,
  p_accept_policies boolean
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
  if p_mime not like 'video/%' then raise exception 'Envie um vídeo'; end if;
  if p_duration_s is not null and p_duration_s > v_max_s + 0.5 then
    raise exception 'O vídeo pode ter até % segundos', v_max_s;
  end if;
  if p_size_bytes is not null and p_size_bytes > v_max_mb::bigint * 1024 * 1024 then
    raise exception 'O vídeo pode ter até % MB', v_max_mb;
  end if;
  -- anti-spam (9.1)
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

  insert into media_assets (owner, path, mime, size_bytes, duration_s)
  values (v_uid, p_media_path, p_mime, p_size_bytes, p_duration_s)
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

-- Moderação (RF-12): aprova, recusa, oculta ou remove; tudo auditado.
create or replace function public.moderate_post(p_post uuid, p_action text, p_reason text default null)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_fresh int := public.config_int('fresh_minutes', 60);
  v_new post_status;
begin
  if not public.is_moderator() then raise exception 'Sem permissão'; end if;
  v_new := case p_action
    when 'approve' then 'published' when 'reject' then 'rejected'
    when 'hide' then 'hidden' when 'remove' then 'removed' else null end::post_status;
  if v_new is null then raise exception 'Ação inválida'; end if;

  update posts set
    status = v_new,
    published_at = case when v_new = 'published' and published_at is null then now() else published_at end,
    fresh_until = case when v_new = 'published' and published_at is null then now() + make_interval(mins => v_fresh) else fresh_until end,
    moderated_by = auth.uid(), moderated_at = now(), moderation_note = p_reason
  where id = p_post;
  if not found then raise exception 'Publicação não encontrada'; end if;

  if v_new = 'published' then
    update media_assets set status = 'ready' where id = (select media_id from posts where id = p_post);
    insert into analytics_events (event_name, user_id, post_id, place_id)
    select 'post_published', author, id, place_id from posts where id = p_post;
  end if;
  if v_new in ('hidden', 'removed') then
    update reports set status = 'actioned' where post_id = p_post and status = 'open';
  end if;

  insert into moderation_actions (moderator, target_type, target_id, action, reason)
  values (auth.uid(), 'post', p_post, p_action, p_reason);
  perform public.audit('moderate_post:' || p_action, 'post', p_post, jsonb_build_object('reason', p_reason));
end;
$$;

-- Denúncia (RF-12): 3 denúncias abertas ocultam temporariamente até revisão.
create or replace function public.report_content(p_post uuid, p_place uuid, p_reason text, p_details text default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Entre na sua conta para denunciar'; end if;
  insert into reports (reporter, post_id, place_id, reason, details)
  values (auth.uid(), p_post, p_place, p_reason, p_details)
  on conflict do nothing;
  if p_post is not null and (select count(*) from reports where post_id = p_post and status = 'open') >= 3 then
    update posts set status = 'hidden', moderation_note = 'ocultado automaticamente por denúncias'
    where id = p_post and status = 'published';
  end if;
end;
$$;

create or replace function public.dismiss_reports(p_post uuid, p_place uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_moderator() then raise exception 'Sem permissão'; end if;
  update reports set status = 'dismissed'
  where status = 'open' and (post_id = p_post or place_id = p_place);
  if p_post is not null then
    update posts set status = 'published', moderation_note = null
    where id = p_post and status = 'hidden' and moderation_note = 'ocultado automaticamente por denúncias';
  end if;
  insert into moderation_actions (moderator, target_type, target_id, action)
  values (auth.uid(), case when p_post is not null then 'post' else 'place' end, coalesce(p_post, p_place), 'dismiss_reports');
  perform public.audit('dismiss_reports', case when p_post is not null then 'post' else 'place' end, coalesce(p_post, p_place));
end;
$$;

-- Reivindicar estabelecimento (RF-11): ninguém assume controle sem aprovação.
create or replace function public.claim_place(p_place uuid, p_org_name text, p_contact text, p_evidence text)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if auth.uid() is null then raise exception 'Entre na sua conta para reivindicar'; end if;
  if public.can_manage_place(p_place) then raise exception 'Você já gerencia este lugar'; end if;
  insert into place_claims (place_id, user_id, org_name, contact, evidence)
  values (p_place, auth.uid(), trim(p_org_name), trim(p_contact), nullif(trim(p_evidence), ''))
  returning id into v_id;
  perform public.audit('claim_place', 'place', p_place, jsonb_build_object('claim', v_id));
  return v_id;
exception when unique_violation then
  raise exception 'Você já tem um pedido em análise para este lugar';
end;
$$;

create or replace function public.decide_claim(p_claim uuid, p_approve boolean, p_note text default null)
returns void language plpgsql security definer set search_path = public as $$
declare
  c place_claims;
  v_org uuid;
begin
  if not public.is_moderator() then raise exception 'Sem permissão'; end if;
  select * into c from place_claims where id = p_claim and status = 'pending' for update;
  if c.id is null then raise exception 'Pedido não encontrado ou já decidido'; end if;

  if p_approve then
    select organization_id into v_org from places where id = c.place_id;
    if v_org is null then
      insert into organizations (name) values (c.org_name) returning id into v_org;
      update places set organization_id = v_org, updated_at = now() where id = c.place_id;
    end if;
    insert into partner_members (organization_id, user_id, role) values (v_org, c.user_id, 'owner')
    on conflict do nothing;
  end if;

  update place_claims set status = case when p_approve then 'approved' else 'rejected' end::claim_status,
    decided_by = auth.uid(), decided_at = now(), decision_note = p_note
  where id = p_claim;
  perform public.audit(case when p_approve then 'approve_claim' else 'reject_claim' end, 'place', c.place_id,
                       jsonb_build_object('claim', p_claim, 'note', p_note));
end;
$$;

-- Analytics (RF-13): só eventos conhecidos; impressão e play deduplicados em 30 min.
create or replace function public.track_event(
  p_event text, p_place uuid default null, p_post uuid default null,
  p_anon_id text default null, p_props jsonb default '{}'
)
returns void language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid();
begin
  if p_event not in ('feed_item_impression', 'place_view', 'post_play', 'post_complete', 'place_save', 'share_click', 'route_click') then
    return;
  end if;
  if v_uid is not null and not coalesce((select analytics_consent from user_preferences where user_id = v_uid), true) then
    return;
  end if;
  if p_event in ('feed_item_impression', 'post_play', 'place_view') and exists (
    select 1 from analytics_events
    where event_name = p_event
      and coalesce(post_id::text, '') = coalesce(p_post::text, '')
      and coalesce(place_id::text, '') = coalesce(p_place::text, '')
      and ((v_uid is not null and user_id = v_uid) or (v_uid is null and anon_id = p_anon_id))
      and created_at > now() - interval '30 minutes'
  ) then
    return;
  end if;
  insert into analytics_events (event_name, user_id, anon_id, place_id, post_id, props)
  values (p_event, v_uid, case when v_uid is null then left(p_anon_id, 64) end, p_place, p_post,
          coalesce(p_props, '{}') - 'lat' - 'lng');
end;
$$;

-- Métricas do parceiro (RF-10, 6.4, QA-11): intenção agregada, nunca "visita".
create or replace function public.partner_analytics(p_place uuid, p_days int default 30)
returns table (event_name text, total bigint, last_7_days bigint)
language plpgsql stable security definer set search_path = public as $$
begin
  if not (public.can_manage_place(p_place) or public.is_moderator()) then raise exception 'Sem permissão'; end if;
  return query
    select e.event_name, count(*), count(*) filter (where e.created_at > now() - interval '7 days')
    from analytics_events e
    where e.place_id = p_place and e.created_at > now() - make_interval(days => p_days)
      and e.event_name in ('place_view', 'route_click', 'share_click', 'place_save', 'post_play')
    group by e.event_name;
end;
$$;

-- Exclusão de conta (RF-09)
create or replace function public.request_account_deletion()
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Sem sessão'; end if;
  insert into account_deletion_requests (user_id) values (auth.uid()) on conflict do nothing;
  perform public.audit('request_account_deletion', 'profile', auth.uid());
end;
$$;

-- permissões de execução
revoke execute on all functions in schema public from public, anon;
grant execute on function public.explore_feed(double precision, double precision, int, text, public.place_category, timestamptz, int) to anon, authenticated;
grant execute on function public.places_nearby(double precision, double precision, int, public.place_category, text, int) to anon, authenticated;
grant execute on function public.place_detail(uuid) to anon, authenticated;
grant execute on function public.list_regions() to anon, authenticated;
grant execute on function public.place_posts(uuid, int) to anon, authenticated;
grant execute on function public.track_event(text, uuid, uuid, text, jsonb) to anon, authenticated;
grant execute on function public.is_moderator() to anon, authenticated;
grant execute on function public.can_manage_place(uuid) to anon, authenticated;
grant execute on function public.my_role() to authenticated;
grant execute on function public.config_int(text, int) to anon, authenticated;
grant execute on function public.config_text(text, text) to anon, authenticated;
grant execute on function public.create_post(uuid, text, text, bigint, numeric, text, boolean) to authenticated;
grant execute on function public.moderate_post(uuid, text, text) to authenticated;
grant execute on function public.report_content(uuid, uuid, text, text) to authenticated;
grant execute on function public.dismiss_reports(uuid, uuid) to authenticated;
grant execute on function public.claim_place(uuid, text, text, text) to authenticated;
grant execute on function public.decide_claim(uuid, boolean, text) to authenticated;
grant execute on function public.partner_analytics(uuid, int) to authenticated;
grant execute on function public.request_account_deletion() to authenticated;
-- funções internas não podem ser chamadas pelo app
revoke execute on function public.audit(text, text, uuid, jsonb) from authenticated;
revoke execute on function public.handle_new_user() from authenticated;

-- =========================================================
-- Storage: bucket privado; vídeo só é servido quando o post está publicado (QA-05)
-- =========================================================
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('media', 'media', false, 62914560, array['video/mp4', 'video/quicktime', 'image/jpeg', 'image/png'])
on conflict (id) do nothing;

create policy "envio na minha pasta" on storage.objects for insert to authenticated
  with check (bucket_id = 'media' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "apago meus arquivos" on storage.objects for delete to authenticated
  using (bucket_id = 'media' and (storage.foldername(name))[1] = auth.uid()::text);
-- verificação feita com privilégio do dono: o visitante não enxerga media_assets, só o resultado
create or replace function public.is_public_media(p_path text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from media_assets m join posts p on p.media_id = m.id
    join places l on l.id = p.place_id and l.status = 'active'
    where m.path = p_path and p.status = 'published'
  );
$$;
revoke execute on function public.is_public_media(text) from public;
grant execute on function public.is_public_media(text) to anon, authenticated;

create policy "vejo mídia publicada, minha ou em moderação" on storage.objects for select to anon, authenticated
  using (
    bucket_id = 'media' and (
      (storage.foldername(name))[1] = auth.uid()::text
      or public.is_moderator()
      or public.is_public_media(name)
    )
  );
