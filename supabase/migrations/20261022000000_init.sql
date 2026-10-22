-- Cola Aqui · esquema inicial do MVP
-- Regras do produto que vivem aqui no banco:
--   * registro vale 4 h no feed (expira_em)
--   * só posta quem está a até 150 m do lugar (create_post)
--   * limite: 5 registros por hora por pessoa e 1 por lugar a cada 10 min
--   * 3 denúncias escondem o registro
--   * origem sempre explícita: comunidade, estabelecimento ou patrocinado

create extension if not exists postgis with schema extensions;

-- ---------- tipos ----------
create type public.place_kind as enum (
  'bar', 'restaurante', 'balada', 'casa_de_show', 'festa', 'evento',
  'feira', 'cultura', 'esporte', 'atletica', 'outro'
);
create type public.post_origin as enum ('comunidade', 'estabelecimento', 'patrocinado');
create type public.post_status as enum ('publicado', 'oculto', 'removido');
create type public.rsvp as enum ('vou', 'talvez', 'nao');

-- ---------- perfis ----------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  username text unique not null check (username ~ '^[a-z0-9_.]{3,24}$'),
  nome text,
  foto_url text,
  bairro text,
  nascimento date,
  created_at timestamptz not null default now()
);

-- cria o perfil quando a conta é criada; bloqueia menores de 18
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_nasc date := nullif(new.raw_user_meta_data ->> 'nascimento', '')::date;
  v_user text := lower(coalesce(nullif(new.raw_user_meta_data ->> 'username', ''),
                                'user_' || substr(new.id::text, 1, 8)));
begin
  if v_nasc is not null and v_nasc > (current_date - interval '18 years') then
    raise exception 'O Cola Aqui é só para maiores de 18 anos';
  end if;
  insert into public.profiles (id, username, nome, nascimento)
  values (new.id, v_user, new.raw_user_meta_data ->> 'nome', v_nasc);
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------- lugares ----------
create table public.places (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  tipo public.place_kind not null default 'bar',
  endereco text,
  bairro text,
  localizacao extensions.geography(Point, 4326) not null,
  instagram text,
  whatsapp text,
  horarios jsonb,
  capa_url text,
  fundador boolean not null default false,
  ativo boolean not null default true,
  created_at timestamptz not null default now()
);
create index places_localizacao_idx on public.places using gist (localizacao);

create table public.place_members (
  place_id uuid references public.places (id) on delete cascade,
  user_id uuid references public.profiles (id) on delete cascade,
  papel text not null default 'dono' check (papel in ('dono', 'equipe')),
  primary key (place_id, user_id)
);

create table public.events (
  id uuid primary key default gen_random_uuid(),
  place_id uuid not null references public.places (id) on delete cascade,
  titulo text not null,
  descricao text,
  inicio timestamptz not null,
  fim timestamptz,
  atracoes text[] not null default '{}',
  link_ingresso text,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);
create index events_place_inicio_idx on public.events (place_id, inicio);

-- ---------- registros (posts) ----------
create table public.posts (
  id uuid primary key default gen_random_uuid(),
  autor uuid not null references public.profiles (id) on delete cascade,
  place_id uuid not null references public.places (id) on delete cascade,
  midia_path text not null,
  tipo text not null default 'video' check (tipo in ('video', 'foto')),
  legenda text check (char_length(legenda) <= 140),
  origem public.post_origin not null default 'comunidade',
  localizacao extensions.geography(Point, 4326) not null,
  gravado_em timestamptz not null default now(),
  created_at timestamptz not null default now(),
  expira_em timestamptz not null default now() + interval '4 hours',
  status public.post_status not null default 'publicado'
);
create index posts_feed_idx on public.posts (expira_em desc) where status = 'publicado';
create index posts_place_idx on public.posts (place_id, created_at desc);
create index posts_autor_idx on public.posts (autor, created_at desc);

-- ---------- convites ----------
create table public.plans (
  id uuid primary key default gen_random_uuid(),
  criador uuid not null references public.profiles (id) on delete cascade,
  place_id uuid not null references public.places (id) on delete cascade,
  horario timestamptz not null,
  mensagem text check (char_length(mensagem) <= 200),
  created_at timestamptz not null default now()
);

create table public.plan_members (
  plan_id uuid references public.plans (id) on delete cascade,
  user_id uuid references public.profiles (id) on delete cascade,
  resposta public.rsvp,
  updated_at timestamptz not null default now(),
  primary key (plan_id, user_id)
);

-- ---------- social, moderação, métricas ----------
create table public.follows (
  seguidor uuid references public.profiles (id) on delete cascade,
  seguido uuid references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (seguidor, seguido),
  check (seguidor <> seguido)
);

create table public.reports (
  id uuid primary key default gen_random_uuid(),
  autor uuid not null references public.profiles (id) on delete cascade,
  post_id uuid references public.posts (id) on delete cascade,
  motivo text not null,
  status text not null default 'aberta' check (status in ('aberta', 'resolvida')),
  created_at timestamptz not null default now(),
  unique (autor, post_id)
);

create table public.place_stats_daily (
  place_id uuid references public.places (id) on delete cascade,
  dia date not null default current_date,
  views int not null default 0,
  rotas int not null default 0,
  convites int not null default 0,
  primary key (place_id, dia)
);

create table public.push_tokens (
  token text primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  plataforma text,
  created_at timestamptz not null default now()
);

-- ---------- helpers ----------
create or replace function public.is_place_member(p_place uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from place_members where place_id = p_place and user_id = auth.uid());
$$;

create or replace function public.is_plan_member(p_plan uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from plans where id = p_plan and criador = auth.uid())
      or exists (select 1 from plan_members where plan_id = p_plan and user_id = auth.uid());
$$;

-- ---------- RLS ----------
alter table public.profiles enable row level security;
alter table public.places enable row level security;
alter table public.place_members enable row level security;
alter table public.events enable row level security;
alter table public.posts enable row level security;
alter table public.plans enable row level security;
alter table public.plan_members enable row level security;
alter table public.follows enable row level security;
alter table public.reports enable row level security;
alter table public.place_stats_daily enable row level security;
alter table public.push_tokens enable row level security;

create policy "perfis visíveis para quem está logado" on public.profiles
  for select to authenticated using (true);
create policy "cada um edita o próprio perfil" on public.profiles
  for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

create policy "lugares visíveis" on public.places
  for select to authenticated using (ativo);
create policy "parceiro edita o próprio lugar" on public.places
  for update to authenticated using (public.is_place_member(id));

create policy "vejo meus vínculos" on public.place_members
  for select to authenticated using (user_id = auth.uid());

create policy "eventos visíveis" on public.events
  for select to authenticated using (true);
create policy "parceiro cria evento" on public.events
  for insert to authenticated with check (public.is_place_member(place_id));
create policy "parceiro edita evento" on public.events
  for update to authenticated using (public.is_place_member(place_id));
create policy "parceiro apaga evento" on public.events
  for delete to authenticated using (public.is_place_member(place_id));

create policy "registros no ar ou meus" on public.posts
  for select to authenticated
  using ((status = 'publicado' and expira_em > now()) or autor = auth.uid());
create policy "apago meu registro" on public.posts
  for delete to authenticated using (autor = auth.uid());
-- inserção só pela função create_post (valida local e limites)

create policy "vejo convites em que estou" on public.plans
  for select to authenticated using (public.is_plan_member(id));
create policy "crio convite" on public.plans
  for insert to authenticated with check (criador = auth.uid());
create policy "apago meu convite" on public.plans
  for delete to authenticated using (criador = auth.uid());

create policy "vejo membros dos meus convites" on public.plan_members
  for select to authenticated using (public.is_plan_member(plan_id));
create policy "criador chama a galera" on public.plan_members
  for insert to authenticated
  with check (exists (select 1 from public.plans p where p.id = plan_id and p.criador = auth.uid()));
create policy "respondo meu convite" on public.plan_members
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "seguidores visíveis" on public.follows
  for select to authenticated using (true);
create policy "sigo" on public.follows
  for insert to authenticated with check (seguidor = auth.uid());
create policy "deixo de seguir" on public.follows
  for delete to authenticated using (seguidor = auth.uid());

create policy "vejo minhas denúncias" on public.reports
  for select to authenticated using (autor = auth.uid());

create policy "parceiro vê números" on public.place_stats_daily
  for select to authenticated using (public.is_place_member(place_id));

create policy "meus tokens" on public.push_tokens
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ---------- funções do app ----------

-- publica um registro validando local (150 m) e limites
create or replace function public.create_post(
  p_place uuid,
  p_midia_path text,
  p_lat double precision,
  p_lng double precision,
  p_tipo text default 'video',
  p_legenda text default null,
  p_gravado_em timestamptz default now()
)
returns uuid
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_uid uuid := auth.uid();
  v_ponto geography := st_setsrid(st_makepoint(p_lng, p_lat), 4326)::geography;
  v_lugar geography;
  v_id uuid;
begin
  if v_uid is null then
    raise exception 'Faça login para postar';
  end if;

  select localizacao into v_lugar from places where id = p_place and ativo;
  if v_lugar is null then
    raise exception 'Lugar não encontrado';
  end if;

  if not st_dwithin(v_lugar, v_ponto, 150) then
    raise exception 'Você precisa estar no lugar para postar (até 150 m)';
  end if;

  if p_gravado_em < now() - interval '10 minutes' then
    raise exception 'Registro precisa ser feito na hora';
  end if;

  if (select count(*) from posts where autor = v_uid and created_at > now() - interval '1 hour') >= 5 then
    raise exception 'Limite de 5 registros por hora';
  end if;

  if exists (select 1 from posts where autor = v_uid and place_id = p_place
             and created_at > now() - interval '10 minutes') then
    raise exception 'Espere 10 minutos para postar de novo neste lugar';
  end if;

  if split_part(p_midia_path, '/', 1) <> v_uid::text then
    raise exception 'Arquivo inválido';
  end if;

  insert into posts (autor, place_id, midia_path, tipo, legenda, origem, localizacao, gravado_em)
  values (v_uid, p_place, p_midia_path, p_tipo, nullif(trim(p_legenda), ''),
          case when public.is_place_member(p_place) then 'estabelecimento'::post_origin
               else 'comunidade'::post_origin end,
          v_ponto, p_gravado_em)
  returning id into v_id;

  return v_id;
end;
$$;

-- feed do agora: registros no ar perto de um ponto
create or replace function public.feed_nearby(
  p_lat double precision,
  p_lng double precision,
  p_raio_m int default 20000,
  p_limite int default 50
)
returns table (
  id uuid,
  midia_path text,
  tipo text,
  legenda text,
  origem public.post_origin,
  created_at timestamptz,
  expira_em timestamptz,
  place_id uuid,
  place_nome text,
  place_tipo public.place_kind,
  place_bairro text,
  autor_username text,
  autor_foto text,
  distancia_m double precision
)
language sql
stable
security invoker
set search_path = public, extensions
as $$
  select p.id, p.midia_path, p.tipo, p.legenda, p.origem, p.created_at, p.expira_em,
         l.id, l.nome, l.tipo, l.bairro, pr.username, pr.foto_url,
         st_distance(l.localizacao, st_setsrid(st_makepoint(p_lng, p_lat), 4326)::geography)
  from posts p
  join places l on l.id = p.place_id
  join profiles pr on pr.id = p.autor
  where p.status = 'publicado'
    and p.expira_em > now()
    and st_dwithin(l.localizacao, st_setsrid(st_makepoint(p_lng, p_lat), 4326)::geography, p_raio_m)
  order by p.created_at desc
  limit p_limite;
$$;

-- lugares perto, com quantos registros estão no ar agora
create or replace function public.places_nearby(
  p_lat double precision,
  p_lng double precision,
  p_raio_m int default 20000
)
returns table (
  id uuid,
  nome text,
  tipo public.place_kind,
  bairro text,
  endereco text,
  fundador boolean,
  lat double precision,
  lng double precision,
  distancia_m double precision,
  registros_agora bigint,
  ultimo_registro timestamptz
)
language sql
stable
security invoker
set search_path = public, extensions
as $$
  select l.id, l.nome, l.tipo, l.bairro, l.endereco, l.fundador,
         st_y(l.localizacao::geometry), st_x(l.localizacao::geometry),
         st_distance(l.localizacao, st_setsrid(st_makepoint(p_lng, p_lat), 4326)::geography),
         count(p.id), max(p.created_at)
  from places l
  left join posts p on p.place_id = l.id and p.status = 'publicado' and p.expira_em > now()
  where l.ativo
    and st_dwithin(l.localizacao, st_setsrid(st_makepoint(p_lng, p_lat), 4326)::geography, p_raio_m)
  group by l.id
  order by count(p.id) desc, 9 asc;
$$;

-- um lugar com coordenadas (para a página do lugar)
create or replace function public.place_detail(p_place uuid)
returns table (
  id uuid, nome text, tipo public.place_kind, bairro text, endereco text,
  instagram text, whatsapp text, fundador boolean, lat double precision, lng double precision
)
language sql
stable
security invoker
set search_path = public, extensions
as $$
  select id, nome, tipo, bairro, endereco, instagram, whatsapp, fundador,
         st_y(localizacao::geometry), st_x(localizacao::geometry)
  from places where id = p_place and ativo;
$$;

-- denúncia; 3 denúncias escondem o registro
create or replace function public.report_post(p_post uuid, p_motivo text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into reports (autor, post_id, motivo) values (auth.uid(), p_post, p_motivo)
  on conflict (autor, post_id) do nothing;
  if (select count(*) from reports where post_id = p_post and status = 'aberta') >= 3 then
    update posts set status = 'oculto' where id = p_post and status = 'publicado';
  end if;
end;
$$;

grant execute on function public.create_post(uuid, text, double precision, double precision, text, text, timestamptz) to authenticated;
grant execute on function public.feed_nearby(double precision, double precision, int, int) to authenticated;
grant execute on function public.places_nearby(double precision, double precision, int) to authenticated;
grant execute on function public.place_detail(uuid) to authenticated;
grant execute on function public.report_post(uuid, text) to authenticated;
revoke execute on function public.create_post(uuid, text, double precision, double precision, text, text, timestamptz) from anon;

-- ---------- storage: vídeos e fotos dos registros ----------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('registros', 'registros', true, 20971520,
        array['video/mp4', 'video/quicktime', 'image/jpeg', 'image/png'])
on conflict (id) do nothing;

create policy "envio na minha pasta" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'registros' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "apago meus arquivos" on storage.objects
  for delete to authenticated
  using (bucket_id = 'registros' and (storage.foldername(name))[1] = auth.uid()::text);
