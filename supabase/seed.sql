-- Lugares de teste em Brasília (coordenadas aproximadas, só para desenvolvimento).
-- Troque/complete com os parceiros fundadores reais antes do lançamento.
insert into public.places (nome, tipo, bairro, endereco, localizacao, instagram) values
  ('Mané Mercado Vírgula', 'bar', 'Eixo Monumental', 'Arena BSB, ao lado do Mané Garrincha',
   extensions.st_setsrid(extensions.st_makepoint(-47.8991, -15.7836), 4326)::extensions.geography, 'manebrasilia'),
  ('Pontão do Lago Sul', 'restaurante', 'Lago Sul', 'SHIS QL 10',
   extensions.st_setsrid(extensions.st_makepoint(-47.8733, -15.8277), 4326)::extensions.geography, 'pontaodolagosul'),
  ('Clube do Choro', 'casa_de_show', 'Eixo Monumental', 'SDC, Eixo Monumental',
   extensions.st_setsrid(extensions.st_makepoint(-47.8968, -15.7899), 4326)::extensions.geography, null),
  ('Feira da Torre de TV', 'feira', 'Eixo Monumental', 'Torre de TV',
   extensions.st_setsrid(extensions.st_makepoint(-47.8923, -15.7905), 4326)::extensions.geography, null);
