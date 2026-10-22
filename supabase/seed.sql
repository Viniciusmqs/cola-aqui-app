-- Parâmetros remotos (5.2 e 9.2 do PRD: hipóteses ajustáveis)
insert into public.app_config (key, value, description) values
  ('fresh_minutes', '60', 'Janela de frescor: minutos em que uma publicação conta como recente'),
  ('video_max_seconds', '20', 'Duração máxima do vídeo'),
  ('video_max_mb', '60', 'Tamanho máximo do vídeo'),
  ('moderation_mode', '"manual"', 'manual = toda publicação passa por moderação; auto = publica direto')
on conflict (key) do update set value = excluded.value;

-- Regiões para escolha manual (centros aproximados)
insert into public.regions (slug, name, center, radius_m, sort) values
  ('brasilia', 'Brasília (todas)', extensions.st_setsrid(extensions.st_makepoint(-47.8828, -15.7939), 4326)::extensions.geography, 30000, 0),
  ('asa-sul', 'Asa Sul', extensions.st_setsrid(extensions.st_makepoint(-47.9060, -15.8140), 4326)::extensions.geography, 4000, 10),
  ('asa-norte', 'Asa Norte', extensions.st_setsrid(extensions.st_makepoint(-47.8830, -15.7620), 4326)::extensions.geography, 4000, 20),
  ('sudoeste', 'Sudoeste', extensions.st_setsrid(extensions.st_makepoint(-47.9260, -15.7980), 4326)::extensions.geography, 2500, 30),
  ('noroeste', 'Noroeste', extensions.st_setsrid(extensions.st_makepoint(-47.9120, -15.7450), 4326)::extensions.geography, 2500, 40),
  ('lago-sul', 'Lago Sul', extensions.st_setsrid(extensions.st_makepoint(-47.8650, -15.8350), 4326)::extensions.geography, 6000, 50),
  ('lago-norte', 'Lago Norte', extensions.st_setsrid(extensions.st_makepoint(-47.8450, -15.7330), 4326)::extensions.geography, 5000, 60),
  ('guara', 'Guará', extensions.st_setsrid(extensions.st_makepoint(-47.9800, -15.8250), 4326)::extensions.geography, 3500, 70),
  ('aguas-claras', 'Águas Claras', extensions.st_setsrid(extensions.st_makepoint(-48.0270, -15.8390), 4326)::extensions.geography, 4000, 80),
  ('taguatinga', 'Taguatinga', extensions.st_setsrid(extensions.st_makepoint(-48.0560, -15.8330), 4326)::extensions.geography, 5000, 90)
on conflict (slug) do nothing;

-- Lugares de teste (coordenadas aproximadas, só para desenvolvimento)
insert into public.places (name, category, neighborhood, region_slug, address, location, instagram) values
  ('Mané Mercado Vírgula', 'bar', 'Eixo Monumental', 'asa-norte', 'Arena BSB, ao lado do Mané Garrincha',
   extensions.st_setsrid(extensions.st_makepoint(-47.8991, -15.7836), 4326)::extensions.geography, 'manebrasilia'),
  ('Pontão do Lago Sul', 'restaurante', 'Lago Sul', 'lago-sul', 'SHIS QL 10',
   extensions.st_setsrid(extensions.st_makepoint(-47.8733, -15.8277), 4326)::extensions.geography, 'pontaodolagosul'),
  ('Clube do Choro', 'casa_de_show', 'Eixo Monumental', 'asa-sul', 'SDC, Eixo Monumental',
   extensions.st_setsrid(extensions.st_makepoint(-47.8968, -15.7899), 4326)::extensions.geography, null),
  ('Feira da Torre de TV', 'feira', 'Eixo Monumental', 'asa-sul', 'Torre de TV',
   extensions.st_setsrid(extensions.st_makepoint(-47.8923, -15.7905), 4326)::extensions.geography, null);
