# E-mails do Cola Aqui (Supabase Auth)

Os e-mails mandam um **código de 6 dígitos** que a pessoa digita no app (tela Entrar). Não usamos link:
link de e-mail abre o navegador, não o app, e o Gmail às vezes "visita" o link antes e ele vence.

| Arquivo | Onde colar no Supabase (Authentication → Emails) | Assunto |
|---|---|---|
| confirmacao.html | Confirm signup | ver assuntos.json |
| recuperacao.html | Reset password | |
| troca-email.html | Change email address | |
| login-codigo.html | Magic link | |

O logo vem de `assets/email/logo-noturno-440.png` neste repositório (público).
Remetente: para trocar "Supabase Auth <noreply@mail.app.supabase.io>" por "Cola Aqui <oi@seu-dominio>",
é preciso SMTP próprio (Authentication → Emails → SMTP Settings), por exemplo Resend com o domínio do Cola Aqui.
