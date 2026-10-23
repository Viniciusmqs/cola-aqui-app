-- Remove toda a demonstração e desliga o agendamento. Rode antes do piloto público.
select cron.unschedule('cola_aqui_demo_refresh');
delete from public.posts where author in (select id from public.profiles where username like 'demo\_%');
delete from public.media_assets where path like 'demo/%';
delete from public.place_events where place_id in (select id from public.places where name like '%(demo)');
delete from public.partner_members where user_id in (select id from public.profiles where username like 'demo\_%');
delete from public.organizations where name like '%(demo)';
delete from public.places where name like '%(demo)';
delete from auth.users where email like 'demo-%@colaaqui.invalid';
-- os arquivos em storage/media/demo podem ser apagados pelo painel do Supabase (Storage → media → demo)
