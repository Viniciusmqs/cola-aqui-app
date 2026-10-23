-- Testes de aceite do PRD; tudo é desfeito no fim (raise exception)
do $t$
declare
  a uuid := '00000000-0000-0000-0000-00000000000a';
  b uuid := '00000000-0000-0000-0000-00000000000b';
  c uuid := '00000000-0000-0000-0000-00000000000c';
  m uuid := '00000000-0000-0000-0000-00000000000d';
  choro uuid; pontao uuid; v_post uuid; v_claim uuid; n int; ok boolean; st text; r text := '';
  procedure_dummy int;
begin
  select id into choro from public.places where name = 'Clube do Choro';
  select id into pontao from public.places where name = 'Pontão do Lago Sul';

  insert into auth.users (id, email, raw_user_meta_data, aud, role) values
   (a, 'qa-a@colaaqui.invalid', '{"username":"qa_a","birthdate":"1995-05-05","terms":"true"}', 'authenticated', 'authenticated'),
   (b, 'qa-b@colaaqui.invalid', '{"username":"qa_b","birthdate":"1990-01-01"}', 'authenticated', 'authenticated'),
   (c, 'qa-c@colaaqui.invalid', '{"username":"qa_c","birthdate":"1990-01-01"}', 'authenticated', 'authenticated'),
   (m, 'qa-m@colaaqui.invalid', '{"username":"qa_mod","birthdate":"1990-01-01"}', 'authenticated', 'authenticated');
  update public.profiles set role = 'moderator' where id = m;
  select count(*) into n from public.user_preferences where user_id = a and terms_accepted_at is not null;
  r := r || 'perfil+prefs=' || n;

  begin
    insert into auth.users (id, email, raw_user_meta_data, aud, role)
    values (gen_random_uuid(), 'qa-menor@colaaqui.invalid', '{"username":"qa_menor","birthdate":"2012-01-01"}', 'authenticated', 'authenticated');
    r := r || ' | menor=ACEITO(ERRO)';
  exception when others then r := r || ' | menor=bloqueado';
  end;

  -- QA-01 visitante
  set local role anon;
  select count(*) into n from public.places_nearby(-15.7939, -47.8828, 30000);
  r := r || ' | QA01 anon_lugares=' || n;
  begin
    perform public.create_post(choro, a || '/x.mp4', 'video/mp4', 1000, 10, 'oi', true);
    r := r || ' | anon_posta=ERRO';
  exception when others then r := r || ' | anon_posta=negado';
  end;
  reset role;

  -- RF-07 publicar como A
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin
    perform public.create_post(choro, a || '/x.mp4', 'video/mp4', 1000, 10, 'oi', false);
    r := r || ' | sem_aceite=ERRO';
  exception when others then r := r || ' | sem_aceite=negado';
  end;
  begin
    perform public.create_post(choro, a || '/longo.mp4', 'video/mp4', 1000, 45, null, true);
    r := r || ' | video_longo=ERRO';
  exception when others then r := r || ' | video_longo=negado';
  end;
  select post_id, status::text into v_post, st from public.create_post(choro, a || '/x.mp4', 'video/mp4', 1000, 12, 'tá cheio', true);
  r := r || ' | post=' || st;
  reset role;

  -- QA-05 pendente não aparece para visitante
  set local role anon;
  select count(*) into n from public.place_posts(choro) where id = v_post;
  r := r || ' | QA05 pendente_publico=' || n;
  reset role;

  -- QA-07 usuário comum não modera
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin
    perform public.moderate_post(v_post, 'approve');
    r := r || ' | autoaprova=ERRO';
  exception when others then r := r || ' | autoaprova=negado';
  end;
  reset role;

  -- moderador aprova
  perform set_config('request.jwt.claims', json_build_object('sub', m, 'role', 'authenticated')::text, true);
  set local role authenticated;
  perform public.moderate_post(v_post, 'approve');
  reset role;
  set local role anon;
  select count(*) into n from public.explore_feed(-15.7939, -47.8828, 30000, 'agora');
  r := r || ' | aprovado_no_agora=' || n;
  select is_fresh::text into st from public.place_posts(choro) limit 1;
  r := r || ' | is_fresh=' || st;
  reset role;

  -- QA-03 vencimento (60 min)
  update public.posts set published_at = now() - interval '61 minutes', fresh_until = now() - interval '1 minute' where id = v_post;
  set local role anon;
  select count(*) into n from public.explore_feed(-15.7939, -47.8828, 30000, 'agora');
  r := r || ' | QA03 vencido_no_agora=' || n;
  select count(*) into n from public.explore_feed(-15.7939, -47.8828, 30000, 'tudo');
  r := r || ' vencido_no_tudo=' || n;
  reset role;

  -- QA-07 / QA-08 reivindicação e isolamento
  perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::text, true);
  set local role authenticated;
  v_claim := public.claim_place(choro, 'Choro Ltda', 'b@x.com', 'cnpj 00');
  update public.places set phone = '6199999' where id = choro;
  get diagnostics n = row_count;
  r := r || ' | QA07 edita_antes=' || n;
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', m, 'role', 'authenticated')::text, true);
  set local role authenticated;
  perform public.decide_claim(v_claim, true, 'ok');
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::text, true);
  set local role authenticated;
  update public.places set phone = '6199999' where id = choro;
  get diagnostics n = row_count;
  r := r || ' edita_depois=' || n;
  update public.places set phone = '6188888' where id = pontao;
  get diagnostics n = row_count;
  r := r || ' | QA08 edita_outro=' || n;
  begin
    update public.places set location = location where id = choro;
    r := r || ' muda_coordenada=ERRO';
  exception when others then r := r || ' muda_coordenada=negado';
  end;
  -- post do gestor sai como estabelecimento
  select post_id into v_post from public.create_post(choro, b || '/e.mp4', 'video/mp4', 1000, 8, null, true);
  select origin::text into st from public.posts where id = v_post;
  r := r || ' | origem_gestor=' || st;
  reset role;

  -- QA-11 métricas: rota é intenção
  set local role anon;
  perform public.track_event('route_click', choro, null, 'anon-1');
  perform public.track_event('place_view', choro, null, 'anon-1');
  perform public.track_event('place_view', choro, null, 'anon-1'); -- duplicado
  perform public.track_event('visita', choro, null, 'anon-1');      -- inválido
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select string_agg(event_name || ':' || total, ',' order by event_name) into st from public.partner_analytics(choro);
  r := r || ' | QA11 metricas=' || coalesce(st, '-');
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin
    perform public.partner_analytics(choro);
    r := r || ' metricas_alheias=ERRO';
  exception when others then r := r || ' metricas_alheias=negado';
  end;
  reset role;

  -- QA-10 denúncias: 3 ocultam
  update public.posts set status = 'published', published_at = now(), fresh_until = now() + interval '60 minutes' where id = v_post;
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  set local role authenticated; perform public.report_content(v_post, null, 'spam'); reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', c, 'role', 'authenticated')::text, true);
  set local role authenticated; perform public.report_content(v_post, null, 'spam'); reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', m, 'role', 'authenticated')::text, true);
  set local role authenticated; perform public.report_content(v_post, null, 'falso'); reset role;
  select status::text into st from public.posts where id = v_post;
  r := r || ' | QA10 apos_3_denuncias=' || st;

  -- privacidade: preferências de outro usuário invisíveis
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from public.user_preferences;
  r := r || ' | prefs_visiveis=' || n;
  begin
    update public.profiles set role = 'admin' where id = a;
    r := r || ' vira_admin=ERRO';
  exception when others then r := r || ' vira_admin=negado';
  end;
  reset role;

  select count(*) into n from public.audit_logs;
  r := r || ' | auditoria=' || n;

  raise exception 'RESULTADO: %', r;
end
$t$;
