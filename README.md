# Cola Aqui · app

O que tá rolando **agora** em Brasília, com vídeo de quem tá lá.

App em Expo (React Native + TypeScript + Expo Router) com backend no Supabase (Auth, Postgres + PostGIS, Storage).

## Rodar no seu celular

```bash
npm install
npx expo start
```

Abra o app **Expo Go** no celular e escaneie o QR code. Para câmera e mapa funcionarem de verdade, use um build de desenvolvimento:

```bash
npx eas-cli@latest build --profile development --platform android
```

## Estrutura

| Pasta | O que tem |
| --- | --- |
| `src/app/(auth)` | Entrar e criar conta (18+) |
| `src/app/(tabs)` | As 4 abas: Agora (feed), Mapa, Postar, Perfil |
| `src/app/lugar/[id].tsx` | Página do lugar: registros, rota e "chamar a galera" |
| `src/components` | Componentes da identidade visual (botões, campos, cards) |
| `src/constants/theme.ts` | Cores e fontes da marca |
| `src/lib` | Supabase, login, localização, consultas |
| `supabase/migrations` | Esquema do banco, regras e permissões (RLS) |
| `supabase/seed.sql` | Lugares de teste em Brasília |

## Regras do produto que estão no banco

- Registro fica 4 horas no feed e sempre mostra "há X min" e a origem (nunca "ao vivo").
- Só posta quem está a até 150 m do lugar, com vídeo gravado na hora pela câmera do app.
- Limite de 5 registros por hora por pessoa e 1 por lugar a cada 10 minutos.
- 3 denúncias escondem o registro.
- Conta só para maiores de 18 anos.

## Supabase

Projeto `cola-aqui` (região São Paulo). A chave publicável está em `src/lib/supabase.ts`; ela pode ficar no app porque o acesso aos dados é protegido por RLS. Para usar outro projeto, crie um `.env` com `EXPO_PUBLIC_SUPABASE_URL` e `EXPO_PUBLIC_SUPABASE_KEY`.
