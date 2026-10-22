# Cola Aqui · app

Descoberta de lugares e experiências em Brasília, com informação recente, comunidade colaborativa e ferramentas para estabelecimentos. Base: **PRD v1.0 (22/10/2026)**.

> O público descobre. Os criadores mostram. Os estabelecimentos atraem clientes.

App em Expo (React Native + TypeScript + Expo Router) com backend no Supabase (Auth, Postgres + PostGIS, Storage, RLS). O PRD sugere NestJS + Next.js; para o piloto o Supabase cumpre o mesmo papel (API, banco geográfico, mídia e permissões) sem servidor próprio.

## Rodar no celular

```bash
npm install
npx expo start
```

Abra o **Expo Go** e escaneie o QR code.

## O que já está no app (P0)

| PRD | Entrega |
| --- | --- |
| RF-01, RF-02 | Visitante explora sem conta; região manual quando o GPS é negado; login só para publicar, salvar, denunciar e reivindicar, voltando ao contexto |
| RF-03 | Explorar: cartões com lugar, bairro, origem, horário e categoria; filtros Agora, Hoje e categorias; paginação por cursor |
| RF-04 | Mapa e lista por proximidade com filtros; nenhuma posição de usuários é exibida |
| RF-05 | Perfil do lugar: endereço, categoria, horário informado, programação, vídeos, "Sem atualização recente" |
| RF-06 | Player com carregamento progressivo e estado de erro recuperável; nunca "ao vivo" |
| RF-07 | Publicar: escolher lugar do catálogo, gravar ou escolher da galeria (até 20 s), aceite de políticas, fica "em análise" até a moderação |
| RF-08 | Compartilhar e "Como chegar" (Maps, Waze, Uber) |
| RF-09 | Salvos, minhas publicações com status, solicitar exclusão de conta |
| RF-10 | Painel Cola Parceiros: dados oficiais, programação e métricas de intenção |
| RF-11 | Reivindicar lugar com aprovação da equipe |
| RF-12 | Denúncia, fila de moderação, decisões auditadas |
| RF-13 | Eventos de analytics com deduplicação |

## Regras no banco

- "Recente" = publicado nos últimos 60 min, ajustável em `app_config.fresh_minutes` sem nova versão do app.
- Rótulo sempre "Publicado há X min · Usuário / Criador / Estabelecimento"; selo "Patrocinado" quando pago.
- Vídeo só é entregue (bucket privado) depois de aprovado.
- Coordenadas de usuários nunca são gravadas em publicações.
- Gestor só altera lugares da própria organização; nome e localização no mapa só pela equipe.
- Anti-spam: 5 publicações por hora e 1 por lugar a cada 10 min. Conta só para maiores de 18.

## Estrutura

| Pasta | O que tem |
| --- | --- |
| `src/app/(tabs)` | Explorar, Mapa, Publicar, Salvos, Perfil |
| `src/app/lugar/[id].tsx` | Perfil do lugar |
| `src/app/entrar.tsx`, `regiao.tsx` | Login (modal) e escolha de região |
| `src/app/reivindicar`, `parceiro`, `moderacao.tsx` | Reivindicação, Cola Parceiros e moderação |
| `src/lib` | Supabase, sessão, região, consultas, analytics, ações |
| `supabase/migrations` | Esquema, permissões (RLS) e funções |
| `supabase/seed.sql` | Configuração, regiões e lugares de teste |
| `supabase/tests/qa_prd.sql` | Casos de aceite do PRD rodando no banco (desfaz tudo ao final) |

## Operação

- **Tornar alguém moderador:** no SQL do Supabase, `update profiles set role = 'admin' where username = 'seu_arroba';`
- **Publicar sem moderação no piloto:** `update app_config set value = '"auto"' where key = 'moderation_mode';`
- **Mudar a janela de frescor:** `update app_config set value = '90' where key = 'fresh_minutes';`
