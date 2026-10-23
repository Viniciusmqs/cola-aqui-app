-- Cola Aqui · dados de demonstração para testar o app.
-- Pode rodar quantas vezes quiser: apaga a demo anterior e recria com horários relativos a agora
-- (os vídeos "recentes" voltam a ficar dentro da janela de 60 min).
-- Vídeos: storage/media/demo/*.mp4 e miniaturas em demo/thumbs/*.jpg (imagens geradas por IA, só para teste).
-- O agendamento cola_aqui_demo_refresh (migração v1) mantém os horários relativos a agora.
-- Usuários demo_* não fazem login. Lugares com "(demo)" no nome são fictícios.

do $demo$
declare
  u_ana uuid := 'de000000-0000-4000-8000-000000000001';
  u_rafa uuid := 'de000000-0000-4000-8000-000000000002';
  u_lu uuid := 'de000000-0000-4000-8000-000000000003';
  u_cri uuid := 'de000000-0000-4000-8000-000000000004';
  u_roof uuid := 'de000000-0000-4000-8000-000000000005';
  org_roof uuid;
  p_choro uuid; p_pontao uuid; p_mane uuid; p_feira uuid; p_arena uuid;
  p_roof uuid; p_boate uuid; p_terraco uuid; p_boteco uuid; p_cafe uuid;
  hoje date := (now() at time zone 'America/Sao_Paulo')::date;
begin
  -- limpa a demo anterior
  delete from public.posts where author in (u_ana, u_rafa, u_lu, u_cri, u_roof);
  delete from public.media_assets where path like 'demo/%';
  delete from public.place_events where created_by in (u_ana, u_rafa, u_lu, u_cri, u_roof)
     or place_id in (select id from public.places where name like '%(demo)');
  delete from public.place_hours where place_id in (select id from public.places where name like '%(demo)'
     or name in ('Clube do Choro', 'Pontão do Lago Sul', 'Mané Mercado Vírgula', 'Feira da Torre de TV'));
  delete from public.partner_members where user_id = u_roof;
  delete from public.organizations where name = 'Rooftop Setor Hoteleiro (demo)';
  delete from public.places where name like '%(demo)';

  -- usuários de demonstração (sem senha, não fazem login)
  insert into auth.users (id, email, raw_user_meta_data, aud, role)
  select v.id, v.email, v.meta::jsonb, 'authenticated', 'authenticated'
  from (values
    (u_ana, 'demo-ana@colaaqui.invalid', '{"username":"demo_ana","birthdate":"1998-03-10"}'),
    (u_rafa, 'demo-rafa@colaaqui.invalid', '{"username":"demo_rafa","birthdate":"1995-07-21"}'),
    (u_lu, 'demo-lu@colaaqui.invalid', '{"username":"demo_lu","birthdate":"2000-11-02"}'),
    (u_cri, 'demo-criador@colaaqui.invalid', '{"username":"demo_criador","birthdate":"1993-01-15"}'),
    (u_roof, 'demo-rooftop@colaaqui.invalid', '{"username":"demo_rooftop","birthdate":"1990-05-05"}')
  ) as v(id, email, meta)
  where not exists (select 1 from auth.users a where a.id = v.id);
  update public.profiles set role = 'creator' where id = u_cri;

  -- lugares existentes
  select id into p_choro from public.places where name = 'Clube do Choro';
  select id into p_pontao from public.places where name = 'Pontão do Lago Sul';
  select id into p_mane from public.places where name = 'Mané Mercado Vírgula';
  select id into p_feira from public.places where name = 'Feira da Torre de TV';

  -- lugares fictícios (coordenadas aproximadas)
  insert into public.places (name, category, neighborhood, region_slug, address, location, is_founder)
  values ('Arena Show Eixo (demo)', 'casa_de_show', 'Eixo Monumental', 'asa-norte', 'Eixo Monumental',
          extensions.st_setsrid(extensions.st_makepoint(-47.8985, -15.7826), 4326)::extensions.geography, false)
  returning id into p_arena;
  insert into public.places (name, category, neighborhood, region_slug, address, location, is_founder, instagram)
  values ('Rooftop Setor Hoteleiro (demo)', 'bar', 'Setor Hoteleiro Sul', 'asa-sul', 'SHS Quadra 2',
          extensions.st_setsrid(extensions.st_makepoint(-47.8889, -15.7968), 4326)::extensions.geography, true, 'colaaqui.bsb')
  returning id into p_roof;
  insert into public.places (name, category, neighborhood, region_slug, address, location)
  values ('Boate SCS (demo)', 'balada', 'Setor Comercial Sul', 'asa-sul', 'SCS Quadra 6',
          extensions.st_setsrid(extensions.st_makepoint(-47.8893, -15.7990), 4326)::extensions.geography)
  returning id into p_boate;
  insert into public.places (name, category, neighborhood, region_slug, address, location)
  values ('Terraço Lago Norte (demo)', 'restaurante', 'Lago Norte', 'lago-norte', 'SHIN QI 5',
          extensions.st_setsrid(extensions.st_makepoint(-47.8440, -15.7340), 4326)::extensions.geography)
  returning id into p_terraco;
  insert into public.places (name, category, neighborhood, region_slug, address, location)
  values ('Boteco 406 Norte (demo)', 'bar', 'Asa Norte', 'asa-norte', 'CLN 406',
          extensions.st_setsrid(extensions.st_makepoint(-47.8775, -15.7700), 4326)::extensions.geography)
  returning id into p_boteco;
  insert into public.places (name, category, neighborhood, region_slug, address, location)
  values ('Café Sudoeste (demo)', 'cafe', 'Sudoeste', 'sudoeste', 'CLSW 300',
          extensions.st_setsrid(extensions.st_makepoint(-47.9265, -15.7985), 4326)::extensions.geography)
  returning id into p_cafe;

  -- o rooftop tem gestor aprovado (testa "Informações oficiais" e origem Estabelecimento)
  insert into public.organizations (name) values ('Rooftop Setor Hoteleiro (demo)') returning id into org_roof;
  update public.places set organization_id = org_roof where id = p_roof;
  insert into public.partner_members (organization_id, user_id, role) values (org_roof, u_roof, 'owner');

  -- mídia (miniatura em demo/thumbs/<nome>.jpg)
  insert into public.media_assets (owner, path, mime, size_bytes, duration_s, status) values
    (u_ana, 'demo/choro_1.mp4', 'video/mp4', 500000, 6, 'ready'),
    (u_rafa, 'demo/choro_2.mp4', 'video/mp4', 500000, 6, 'ready'),
    (u_lu, 'demo/pontao_1.mp4', 'video/mp4', 500000, 6, 'ready'),
    (u_cri, 'demo/pontao_2.mp4', 'video/mp4', 500000, 6, 'ready'),
    (u_ana, 'demo/mane_1.mp4', 'video/mp4', 500000, 6, 'ready'),
    (u_roof, 'demo/rooftop_1.mp4', 'video/mp4', 500000, 6, 'ready'),
    (u_rafa, 'demo/rooftop_2.mp4', 'video/mp4', 500000, 6, 'ready'),
    (u_lu, 'demo/boate_1.mp4', 'video/mp4', 500000, 6, 'ready'),
    (u_cri, 'demo/boate_2.mp4', 'video/mp4', 500000, 6, 'ready'),
    (u_rafa, 'demo/arena_1.mp4', 'video/mp4', 500000, 6, 'ready'),
    (u_ana, 'demo/arena_2.mp4', 'video/mp4', 500000, 6, 'ready'),
    (u_lu, 'demo/festa_1.mp4', 'video/mp4', 500000, 6, 'ready'),
    (u_cri, 'demo/festa_2.mp4', 'video/mp4', 500000, 6, 'ready'),
    (u_rafa, 'demo/happy_2.mp4', 'video/mp4', 500000, 6, 'ready');

  update public.media_assets
     set thumbnail_path = 'demo/thumbs/' || replace(split_part(path, '/', 2), '.mp4', '.jpg')
   where path like 'demo/%';

  -- publicações: várias dentro da janela de 60 min, outras de hoje e de ontem
  create temp table _demo (author uuid, place uuid, path text, caption text, origin text, sponsored boolean, ago int) on commit drop;
  insert into _demo values
    (u_ana, p_choro, 'demo/choro_1.mp4', 'Roda de samba começando, ainda tem mesa', 'user', false, 4),
    (u_roof, p_roof, 'demo/rooftop_1.mp4', 'Pôr do sol com DJ até as 22h', 'establishment', true, 9),
    (u_lu, p_boate, 'demo/boate_1.mp4', 'Pista enchendo, fila andando rápido', 'user', false, 14),
    (u_cri, p_pontao, 'demo/pontao_2.mp4', 'O lago tá surreal hoje', 'creator', false, 19),
    (u_rafa, p_arena, 'demo/arena_1.mp4', 'Show já começou', 'user', false, 26),
    (u_lu, p_terraco, 'demo/festa_1.mp4', 'Happy hour com vista', 'user', false, 33),
    (u_ana, p_mane, 'demo/mane_1.mp4', null, 'user', false, 41),
    (u_rafa, p_roof, 'demo/rooftop_2.mp4', 'Mesa na beira, recomendo chegar cedo', 'user', false, 52),
    (u_cri, p_boate, 'demo/boate_2.mp4', 'Set de house agora', 'creator', false, 95),
    (u_lu, p_pontao, 'demo/pontao_1.mp4', 'Final de tarde tranquilo', 'user', false, 140),
    (u_rafa, p_choro, 'demo/choro_2.mp4', null, 'user', false, 210),
    (u_ana, p_arena, 'demo/arena_2.mp4', 'Passagem de som', 'user', false, 300),
    (u_cri, p_terraco, 'demo/festa_2.mp4', 'Brinde de sexta', 'creator', false, 1500),
    (u_rafa, p_boteco, 'demo/happy_2.mp4', 'Chopp gelado e mesa na calçada', 'user', false, 1700);

  insert into public.posts (author, place_id, media_id, caption, origin, sponsored, status, created_at, published_at, fresh_until)
  select v.author, v.place, m.id, v.caption, v.origin::public.post_origin, v.sponsored, 'published',
         now() - make_interval(mins => v.ago), now() - make_interval(mins => v.ago),
         now() - make_interval(mins => v.ago) + interval '60 minutes'
  from _demo v join public.media_assets m on m.path = v.path;

  -- registra os posts de demo para o agendamento manter os horários relativos a agora
  insert into public.demo_posts (post_id, ago_min)
  select p.id, v.ago from _demo v
  join public.media_assets m on m.path = v.path
  join public.posts p on p.media_id = m.id;

  -- horários informados
  insert into public.place_hours (place_id, weekday, opens, closes)
  select p, d, o::time, c::time
  from (values (p_choro, '19:00', '01:00'), (p_roof, '16:00', '00:00'), (p_boate, '23:00', '05:00'),
               (p_pontao, '11:00', '23:00'), (p_terraco, '12:00', '00:00'), (p_boteco, '17:00', '01:00'),
               (p_cafe, '07:00', '19:00'), (p_mane, '12:00', '23:00')) as h(p, o, c)
  cross join generate_series(0, 6) as d
  where not (h.p = p_boate and d in (1, 2, 3));

  -- programação (horário de Brasília)
  insert into public.place_events (place_id, title, description, starts_at, created_by) values
    (p_choro, 'Choro de quinta com trio convidado', 'Couvert artístico', (hoje + time '20:30') at time zone 'America/Sao_Paulo', u_roof),
    (p_roof, 'Sunset com DJ residente', 'Entrada gratuita até 19h', (hoje + time '17:30') at time zone 'America/Sao_Paulo', u_roof),
    (p_boate, 'Noite de house', 'Line-up local', (hoje + 1 + time '23:00') at time zone 'America/Sao_Paulo', u_roof),
    (p_arena, 'Show de pop nacional', 'Ingressos na bilheteria', (hoje + 2 + time '21:00') at time zone 'America/Sao_Paulo', u_roof),
    (p_feira, 'Feira de artesanato', 'Sábado e domingo', (hoje + 2 + time '09:00') at time zone 'America/Sao_Paulo', u_roof);
end
$demo$;
