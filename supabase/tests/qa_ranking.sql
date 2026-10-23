-- QA da ordem do feed e da busca de lugares. Não deixa rastro: tudo roda dentro de uma transação desfeita no fim.
-- Os lugares de teste ficam longe de Brasília (lat −10, lng −50) para não misturar com dados reais.
begin;

create temp table qa_result (n serial, caso text, ok boolean, detalhe text);
grant all on qa_result to anon, authenticated;
grant usage, select on sequence qa_result_n_seq to anon, authenticated;

create function pg_temp.autor(p_name text) returns uuid language plpgsql as $$
declare v uuid := gen_random_uuid();
begin
  insert into auth.users (id, email, raw_user_meta_data, aud, role)
  values (v, p_name || '@qa.invalid', json_build_object('username', p_name, 'birthdate', '1995-01-01'), 'authenticated', 'authenticated');
  return v;
end $$;

create function pg_temp.lugar(p_name text, p_km_norte double precision, p_cat public.place_category default 'bar')
returns uuid language plpgsql as $$
declare v uuid;
begin
  insert into public.places (name, category, neighborhood, location)
  values (p_name, p_cat, 'Bairro QA',
          extensions.st_setsrid(extensions.st_makepoint(-50, -10 + p_km_norte / 111.0), 4326)::extensions.geography)
  returning id into v;
  return v;
end $$;

create function pg_temp.post(p_author uuid, p_place uuid, p_min_ago double precision,
                             p_origin public.post_origin default 'user', p_sponsored boolean default false)
returns uuid language plpgsql as $$
declare m uuid; v uuid;
begin
  insert into public.media_assets (owner, path, mime, status)
  values (p_author, 'qa/' || gen_random_uuid() || '.mp4', 'video/mp4', 'ready') returning id into m;
  insert into public.posts (author, place_id, media_id, origin, sponsored, status, created_at, published_at, fresh_until)
  values (p_author, p_place, m, p_origin, p_sponsored, 'published',
          now() - make_interval(secs => p_min_ago * 60), now() - make_interval(secs => p_min_ago * 60),
          now() - make_interval(secs => p_min_ago * 60) + interval '60 minutes')
  returning id into v;
  return v;
end $$;

create function pg_temp.feed(p_mode text default 'agora', p_seen uuid[] default '{}', p_offset int default 0, p_limit int default 50,
                             p_as_of timestamptz default null)
returns setof uuid language sql as $$
  select id from public.feed_ranked(-10, -50, 30000, p_mode, null, p_as_of, p_offset, p_limit, p_seen) order by rank_pos
$$;

create function pg_temp.pos(p_post uuid, p_mode text default 'agora', p_seen uuid[] default '{}') returns int language sql as $$
  select rank_pos from public.feed_ranked(-10, -50, 30000, p_mode, null, null, 0, 50, p_seen) where id = p_post
$$;

create function pg_temp.ok(p_caso text, p_ok boolean, p_detalhe text default '') returns void language sql as $$
  insert into qa_result (caso, ok, detalhe) values (p_caso, coalesce(p_ok, false), p_detalhe)
$$;

-- ---------- cenário ----------
do $$
declare
  a uuid := pg_temp.autor('qa_ana'); b uuid := pg_temp.autor('qa_bia'); c uuid := pg_temp.autor('qa_caio');
  d uuid := pg_temp.autor('qa_davi'); e uuid := pg_temp.autor('qa_eva'); f uuid := pg_temp.autor('qa_fabi');
  perto uuid := pg_temp.lugar('QA Perto', 0.3);
  perto2 uuid := pg_temp.lugar('QA Perto Dois', 0.4);
  longe uuid := pg_temp.lugar('QA Longe', 10);
  meio uuid := pg_temp.lugar('QA Meio', 3);
  agito uuid := pg_temp.lugar('QA Agito', 1);
  calmo uuid := pg_temp.lugar('QA Calmo', 1);
  cafe uuid := pg_temp.lugar('QA Café Açaí', 2, 'cafe');
  v_novo uuid; v_velho uuid; v_perto uuid; v_longe uuid; v_longe_novo uuid; v_perto_25 uuid;
  v_agito uuid; v_calmo uuid; v_estab uuid; v_user uuid; v_sp1 uuid; v_sp2 uuid; v_sp3 uuid;
  v_visto uuid; v_den uuid; v_vencido uuid; v_eng uuid; v_sem_eng uuid; v_depois uuid;
  p1 uuid[]; p2 uuid[]; todos uuid[]; foto timestamptz; n int; x int; y int;
begin
  -- 1) recência: mesmo lugar e distância, 5 min vence 40 min
  v_novo := pg_temp.post(a, perto, 5);
  v_velho := pg_temp.post(b, perto2, 40);
  perform pg_temp.ok('Mais recente vem antes (mesma distância)', pg_temp.pos(v_novo) < pg_temp.pos(v_velho),
                     pg_temp.pos(v_novo) || ' x ' || pg_temp.pos(v_velho));

  -- 2) distância: mesma idade, 3 km vence 10 km
  v_perto := pg_temp.post(c, meio, 15);
  v_longe := pg_temp.post(d, longe, 15);
  perform pg_temp.ok('Mais perto vem antes (mesma idade)', pg_temp.pos(v_perto) < pg_temp.pos(v_longe),
                     pg_temp.pos(v_perto) || ' x ' || pg_temp.pos(v_longe));

  -- 3) troca justa: 8 min a 10 km perde para 25 min a 0,3 km (perto e ainda recente)
  v_longe_novo := pg_temp.post(e, longe, 8);
  v_perto_25 := pg_temp.post(f, perto, 25);
  perform pg_temp.ok('Perto e recente vence muito longe e um pouco mais novo',
                     pg_temp.pos(v_perto_25) < pg_temp.pos(v_longe_novo),
                     pg_temp.pos(v_perto_25) || ' x ' || pg_temp.pos(v_longe_novo));

  -- 4) movimento: 3 pessoas no Agito na última hora > 1 pessoa no Calmo (mesma idade e distância)
  -- autores novos, para a penalidade de autor repetido não interferir
  v_agito := pg_temp.post(pg_temp.autor('qa_g1'), agito, 20);
  perform pg_temp.post(pg_temp.autor('qa_g2'), agito, 35);
  perform pg_temp.post(pg_temp.autor('qa_g3'), agito, 50);
  v_calmo := pg_temp.post(pg_temp.autor('qa_h1'), calmo, 20);
  perform pg_temp.ok('Lugar com várias pessoas publicando sobe', pg_temp.pos(v_agito) < pg_temp.pos(v_calmo),
                     pg_temp.pos(v_agito) || ' x ' || pg_temp.pos(v_calmo));
  select place_recent_authors into n from public.feed_ranked(-10, -50, 30000, 'agora', null, null, 0, 50) where id = v_agito;
  perform pg_temp.ok('Conta pessoas diferentes no lugar na última hora', n = 3, 'autores=' || n);

  -- 5) diversidade: o Agito tem 3 vídeos, mas os 3 não ficam colados no topo
  select count(*) into n from (
    select place_id from public.feed_ranked(-10, -50, 30000, 'agora', null, null, 0, 50) order by rank_pos limit 5
  ) t where place_id = agito;
  perform pg_temp.ok('Top 5 não repete o mesmo lugar 3 vezes', n <= 2, 'agito_no_top5=' || n);
end $$;

-- os cenários seguintes usam os mesmos lugares (consulta por nome)
do $$
declare
  meio uuid := (select id from public.places where name = 'QA Meio');
  perto uuid := (select id from public.places where name = 'QA Perto');
  longe uuid := (select id from public.places where name = 'QA Longe');
  a uuid := (select id from public.profiles where username = 'qa_ana');
  b uuid := (select id from public.profiles where username = 'qa_bia');
  c uuid := (select id from public.profiles where username = 'qa_caio');
  v_user uuid; v_estab uuid; v_sp1 uuid; v_sp2 uuid; v_sp3 uuid; v_visto uuid; v_den uuid;
  v_vencido uuid; v_depois uuid; s1 double precision; s2 double precision;
  p1 uuid[]; p2 uuid[]; todos uuid[]; foto timestamptz; n int;
  sp_pos int[];
begin
  -- 6) origem
  -- lugares e autores próprios: só a origem muda entre os dois
  v_user := pg_temp.post(pg_temp.autor('qa_o1'), pg_temp.lugar('QA Origem Um', 6), 12);
  v_estab := pg_temp.post(pg_temp.autor('qa_o2'), pg_temp.lugar('QA Origem Dois', 6), 12, 'establishment');
  select score into s1 from public.feed_ranked(-10, -50, 30000, 'agora', null, null, 0, 50) where id = v_user;
  select score into s2 from public.feed_ranked(-10, -50, 30000, 'agora', null, null, 0, 50) where id = v_estab;
  perform pg_temp.ok('Post de usuário vem antes do orgânico do estabelecimento', s1 > s2, round(s1::numeric, 4) || ' x ' || round(s2::numeric, 4));

  -- 7) patrocinado: nunca abre o feed, entra na posição 3, 1 por lugar
  v_sp1 := pg_temp.post(c, perto, 2, 'establishment', true);
  v_sp2 := pg_temp.post(a, perto, 3, 'establishment', true);   -- mesmo lugar: não entra
  v_sp3 := pg_temp.post(b, meio, 4, 'establishment', true);
  select array_agg(rank_pos order by rank_pos) into sp_pos from public.feed_ranked(-10, -50, 30000, 'agora', null, null, 0, 50) where sponsored;
  perform pg_temp.ok('Patrocinado na posição 3 e depois a cada 6', sp_pos = array[3, 9], array_to_string(sp_pos, ','));
  perform pg_temp.ok('Patrocinado nunca é o primeiro', (select sponsored from public.feed_ranked(-10, -50, 30000, 'agora', null, null, 0, 50) where rank_pos = 1) = false);
  perform pg_temp.ok('No máximo 1 patrocinado por lugar', not exists (select 1 from public.feed_ranked(-10, -50, 30000, 'agora', null, null, 0, 50) where id = v_sp2));

  -- 8) já visto desce
  select id into v_visto from public.feed_ranked(-10, -50, 30000, 'agora', null, null, 0, 50) where not sponsored order by rank_pos limit 1;
  perform pg_temp.ok('Vídeo já visto desce', pg_temp.pos(v_visto, 'agora', array[v_visto]) > 1,
                     '1 → ' || pg_temp.pos(v_visto, 'agora', array[v_visto]));

  -- 9) denúncia aberta derruba
  select id into v_den from public.feed_ranked(-10, -50, 30000, 'agora', null, null, 0, 50) where not sponsored order by rank_pos limit 1;
  insert into public.reports (reporter, post_id, reason) values (c, v_den, 'falso');
  perform pg_temp.ok('Denúncia aberta derruba o vídeo', pg_temp.pos(v_den) > 1, '1 → ' || pg_temp.pos(v_den));

  -- 10) janela: vencido sai do Agora e continua no Hoje (se for de hoje)
  v_vencido := pg_temp.post(a, perto, 75);
  perform pg_temp.ok('Vídeo com mais de 60 min sai do Agora', pg_temp.pos(v_vencido, 'agora') is null);
  perform pg_temp.ok('...e aparece no Hoje', pg_temp.pos(v_vencido, 'hoje') is not null
                     or (now() at time zone 'America/Sao_Paulo')::time < time '01:16');

  -- 11) paginação estável: páginas da mesma foto somam a lista completa, sem repetir nem pular
  foto := now();
  select array_agg(x) into todos from pg_temp.feed('agora', '{}', 0, 50, foto) x;
  select array_agg(x) into p1 from pg_temp.feed('agora', '{}', 0, 4, foto) x;
  select array_agg(x) into p2 from pg_temp.feed('agora', '{}', 4, 50, foto) x;
  perform pg_temp.ok('Páginas somam a lista completa', p1 || p2 = todos, cardinality(p1) || '+' || cardinality(p2) || '=' || cardinality(todos));

  -- 12) vídeo novo depois da foto não embaralha as páginas; aparece no aviso de novos
  perform pg_sleep(0.01);
  v_depois := pg_temp.post(b, perto, 0);
  update public.posts set published_at = foto + interval '1 second', fresh_until = foto + interval '61 minutes' where id = v_depois;
  select array_agg(x) into p2 from pg_temp.feed('agora', '{}', 4, 50, foto) x;
  perform pg_temp.ok('Página 2 da mesma foto não muda com vídeo novo', p1 || p2 = todos);
  perform pg_temp.ok('Aviso de vídeos novos conta o que chegou', public.feed_new_count(-10, -50, 30000, null, foto) >= 0);

  -- 13) a pontuação respeita a ordem (sem empate instável)
  perform pg_temp.ok('Ordem orgânica acompanha a pontuação',
    not exists (
      select 1 from (
        select score, lead(score) over (order by rank_pos) as prox
        from public.feed_ranked(-10, -50, 30000, 'agora', null, null, 0, 50) where not sponsored
      ) t where prox > score + 1e-9));
end $$;

-- 12b) o aviso conta exatamente quem chegou depois da foto
do $$
declare foto timestamptz := now() - interval '30 seconds'; n_antes int; n_depois int;
  a uuid := (select id from public.profiles where username = 'qa_ana');
  perto uuid := (select id from public.places where name = 'QA Perto');
begin
  n_antes := public.feed_new_count(-10, -50, 30000, null, foto);
  perform pg_temp.post(a, perto, 0.1);
  n_depois := public.feed_new_count(-10, -50, 30000, null, foto);
  perform pg_temp.ok('"N vídeos novos" soma 1 a cada vídeo novo', n_depois = n_antes + 1, n_antes || ' → ' || n_depois);
end $$;

-- 14) engajamento ajuda, mas tem teto: não fura a recência
do $$
declare
  a uuid := (select id from public.profiles where username = 'qa_ana');
  b uuid := (select id from public.profiles where username = 'qa_bia');
  l1 uuid := pg_temp.lugar('QA Eng Um', 5); l2 uuid := pg_temp.lugar('QA Eng Dois', 5);
  v_famoso uuid := pg_temp.post(a, l1, 45);
  v_novo uuid := pg_temp.post(b, l2, 5);
  i int;
begin
  for i in 1..500 loop
    insert into public.analytics_events (event_name, anon_id, post_id, place_id) values ('post_complete', 'qa' || i, v_famoso, l1);
  end loop;
  perform pg_temp.ok('Muito engajamento não passa vídeo bem mais novo', pg_temp.pos(v_novo) < pg_temp.pos(v_famoso),
                     pg_temp.pos(v_novo) || ' x ' || pg_temp.pos(v_famoso));
end $$;

-- 14b) aprovação tardia não rejuvenesce o vídeo
do $$
declare
  a uuid := (select id from public.profiles where username = 'qa_ana');
  l uuid := pg_temp.lugar('QA Fila', 4);
  m uuid; v40 uuid; v70 uuid; idade numeric; dentro boolean;
begin
  insert into public.media_assets (owner, path, mime, status) values (a, 'qa/fila40.mp4', 'video/mp4', 'ready') returning id into m;
  insert into public.posts (author, place_id, media_id, status, created_at)
  values (a, l, m, 'pending_review', now() - interval '40 minutes') returning id into v40;
  insert into public.media_assets (owner, path, mime, status) values (a, 'qa/fila70.mp4', 'video/mp4', 'ready') returning id into m;
  insert into public.posts (author, place_id, media_id, status, created_at)
  values (a, l, m, 'pending_review', now() - interval '70 minutes') returning id into v70;
  -- moderador aprova agora (mesmo caminho do moderate_post)
  update public.posts set status = 'published', published_at = now() where id in (v40, v70);
  select round(extract(epoch from fresh_until - now()) / 60) into idade from public.posts where id = v40;
  perform pg_temp.ok('Aprovado 40 min depois: só restam ~20 min no Agora', idade between 19 and 20, 'restam=' || idade || ' min');
  perform pg_temp.ok('Aprovado 70 min depois: nem entra no Agora', pg_temp.pos(v70, 'agora') is null);
  select sent_at < published_at - interval '39 minutes' into dentro from public.feed_ranked(-10, -50, 30000, 'agora', null, null, 0, 50) where id = v40;
  perform pg_temp.ok('Feed devolve a hora de envio para o rótulo', dentro);
end $$;

-- 14c) só câmera do app, gravado agora
do $$
declare
  a uuid := pg_temp.autor('qa_camera'); -- autor sem posts (não esbarra no limite de 5 por hora)
  l uuid := pg_temp.lugar('QA Camera', 7);
  msg text; v uuid; idade numeric;
begin
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  begin
    perform public.create_post(l, a || '/g.mp4', 'video/mp4', 1000, 10, null, true, null, now(), 'gallery');
    msg := 'aceitou';
  exception when others then msg := sqlerrm; end;
  perform pg_temp.ok('Vídeo da galeria é recusado', msg like 'Grave o vídeo pela câmera%', msg);
  begin
    perform public.create_post(l, a || '/s.mp4', 'video/mp4', 1000, 10, null, true);
    msg := 'aceitou';
  exception when others then msg := sqlerrm; end;
  perform pg_temp.ok('Sem horário de gravação é recusado', msg like 'Grave o vídeo pela câmera%', msg);
  begin
    perform public.create_post(l, a || '/v.mp4', 'video/mp4', 1000, 10, null, true, null, now() - interval '11 minutes', 'camera');
    msg := 'aceitou';
  exception when others then msg := sqlerrm; end;
  perform pg_temp.ok('Gravado há mais de 10 min é recusado', msg like '%mais de 10 min%', msg);
  begin
    perform public.create_post(l, a || '/f.mp4', 'video/mp4', 1000, 10, null, true, null, now() + interval '5 minutes', 'camera');
    msg := 'aceitou';
  exception when others then msg := sqlerrm; end;
  perform pg_temp.ok('Horário de gravação no futuro é recusado', msg like '%inválido%', msg);
  select post_id into v from public.create_post(l, a || '/ok.mp4', 'video/mp4', 1000, 10, null, true, null, now() - interval '8 minutes', 'camera');
  update public.posts set status = 'published', published_at = now() where id = v;
  select round(extract(epoch from fresh_until - now()) / 60) into idade from public.posts where id = v;
  perform pg_temp.ok('Gravado há 8 min: janela conta da gravação (~52 min restantes)', idade between 51 and 52, 'restam=' || idade);
  perform pg_temp.ok('Rótulo usa a hora da gravação',
    (select sent_at < now() - interval '7 minutes' from public.feed_ranked(-10, -50, 30000, 'agora', null, null, 0, 50) where id = v));
  perform set_config('request.jwt.claims', '', true);
end $$;

-- 15) busca de lugares
do $$
declare n int; primeiro text;
begin
  select count(*) into n from public.places_nearby(-10, -50, 30000, null, 'cafe') where name = 'QA Café Açaí';
  perform pg_temp.ok('Busca ignora acento ("cafe" acha "Café")', n = 1);
  select count(*) into n from public.places_nearby(-10, -50, 30000, null, 'ACAI') where name = 'QA Café Açaí';
  perform pg_temp.ok('Busca ignora maiúsculas e cedilha ("ACAI")', n = 1);
  select count(*) into n from public.places_nearby(-10, -50, 30000, null, 'bairro qa');
  perform pg_temp.ok('Busca procura no bairro', n >= 5, 'achou=' || n);
  select count(*) into n from public.places_nearby(-15.79, -47.88, 1000, null, 'QA Perto');
  perform pg_temp.ok('Busca procura na cidade toda, fora do raio', n >= 1);
  select name into primeiro from public.places_nearby(-10, -50, 30000, null, 'qa perto') limit 1;
  perform pg_temp.ok('Nome que começa com o termo vem primeiro', primeiro like 'QA Perto%', primeiro);
  select name into primeiro from public.places_nearby(-10, -50, 30000, null, null) limit 1;
  perform pg_temp.ok('Sem busca: lugar com movimento vem antes', primeiro in ('QA Agito', 'QA Perto', 'QA Perto Dois', 'QA Meio'), primeiro);
  select count(*) into n from public.places_nearby(-10, -50, 30000, null, null) p
   where p.fresh_posts = 0 and exists (select 1 from public.places_nearby(-10, -50, 30000, null, null) q
     where q.fresh_posts > 0 and q.distance_m > p.distance_m);
  perform pg_temp.ok('Lugar sem vídeo recente nunca passa um com vídeo', not exists (
    select 1 from (select fresh_posts, row_number() over () r from public.places_nearby(-10, -50, 30000, null, null)) t1
    join (select fresh_posts, row_number() over () r from public.places_nearby(-10, -50, 30000, null, null)) t2
      on t2.r = t1.r + 1 where t1.fresh_posts = 0 and t2.fresh_posts > 0));
end $$;

-- 16) visitante (anon) consegue usar o feed e a busca
set local role anon;
do $$ begin
  perform pg_temp.ok('Visitante lê o feed ordenado', (select count(*) from public.feed_ranked(-10, -50, 30000, 'agora', null, null, 0, 50)) > 0);
  perform pg_temp.ok('Visitante consulta o relógio do servidor', public.server_time() is not null);
end $$;
reset role;

select n, case when ok then 'PASSOU' else 'FALHOU' end as resultado, caso, detalhe from qa_result order by n;
select count(*) filter (where ok) || '/' || count(*) as total from qa_result;
rollback;
