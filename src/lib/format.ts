import type { PostOrigin } from './types';

/** Nunca "ao vivo" para vídeo gravado (PRD 5.1): sempre o tempo desde a publicação. */
export function tempoDesde(iso: string, now: number = Date.now()) {
  const min = Math.floor(Math.max(0, now - new Date(iso).getTime()) / 60000);
  if (min < 1) return 'há menos de 1 min';
  if (min < 60) return `há ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `há ${h} h`;
  const d = Math.floor(h / 24);
  return d === 1 ? 'há 1 dia' : `há ${d} dias`;
}

export const origemLabel: Record<PostOrigin, string> = {
  user: 'Usuário',
  creator: 'Criador',
  establishment: 'Estabelecimento',
};

/** "Publicado há 8 min · Usuário" (PRD 5.1). */
export function rotuloPublicacao(iso: string, origin: PostOrigin, now: number = Date.now()) {
  return `Publicado ${tempoDesde(iso, now)} · ${origemLabel[origin]}`;
}

export function distancia(m: number) {
  if (m < 1000) return `${Math.max(10, Math.round(m / 10) * 10)} m`;
  return `${(m / 1000).toFixed(m < 10000 ? 1 : 0).replace('.', ',')} km`;
}

const DIAS = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
export const diaSemana = (n: number) => DIAS.at(n) ?? '';

/** "Hoje · 20:30", "Amanhã · 23:00" ou "Sábado, 25/10 · 21:00" — sempre no horário de Brasília. */
export function dataEvento(iso: string, now: number = Date.now()) {
  const d = new Date(new Date(iso).getTime() - 3 * 3600 * 1000);
  const n = new Date(now - 3 * 3600 * 1000);
  const dia = (x: Date) => Date.UTC(x.getUTCFullYear(), x.getUTCMonth(), x.getUTCDate());
  const diff = Math.round((dia(d) - dia(n)) / 86400000);
  const p2 = (v: number) => String(v).padStart(2, '0');
  const hora = `${p2(d.getUTCHours())}:${p2(d.getUTCMinutes())}`;
  if (diff === 0) return `Hoje · ${hora}`;
  if (diff === 1) return `Amanhã · ${hora}`;
  return `${diaSemana(d.getUTCDay())}, ${p2(d.getUTCDate())}/${p2(d.getUTCMonth() + 1)} · ${hora}`;
}

export const horaCurta = (t: string) => t.slice(0, 5);

/** Idade completa a partir de AAAA-MM-DD. */
export function idade(nascimento: string, hoje = new Date()) {
  const [a, m, d] = nascimento.split('-').map(Number);
  let anos = hoje.getFullYear() - a;
  const mes = hoje.getMonth() + 1;
  if (mes < m || (mes === m && hoje.getDate() < d)) anos -= 1;
  return anos;
}

/** DD/MM/AAAA → AAAA-MM-DD (ou null se inválida). */
export function parseDataBR(txt: string) {
  const m = txt.trim().match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!m) return null;
  const [, d, mo, a] = m;
  const date = new Date(Number(a), Number(mo) - 1, Number(d));
  if (date.getFullYear() !== Number(a) || date.getMonth() !== Number(mo) - 1 || date.getDate() !== Number(d))
    return null;
  return `${a}-${mo}-${d}`;
}

/** DD/MM/AAAA HH:MM → ISO (horário de Brasília). */
export function parseDataHoraBR(txt: string) {
  const m = txt.trim().match(/^(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}):(\d{2})$/);
  if (!m) return null;
  const [, d, mo, a, h, mi] = m;
  if (!parseDataBR(`${d}/${mo}/${a}`) || Number(h) > 23 || Number(mi) > 59) return null;
  return `${a}-${mo}-${d}T${h}:${mi}:00-03:00`;
}

export function mascaraData(txt: string) {
  const d = txt.replace(/\D/g, '').slice(0, 8);
  if (d.length <= 2) return d;
  if (d.length <= 4) return `${d.slice(0, 2)}/${d.slice(2)}`;
  return `${d.slice(0, 2)}/${d.slice(2, 4)}/${d.slice(4)}`;
}

/** Erros do Supabase em português, sem jargão. */
export function mensagemDeErro(e: unknown) {
  const msg =
    e instanceof Error
      ? e.message
      : typeof e === 'object' && e && 'message' in e
        ? String((e as { message: unknown }).message)
        : String(e);
  if (/Invalid login credentials/i.test(msg)) return 'E-mail ou senha incorretos.';
  if (/Email not confirmed/i.test(msg)) return 'Falta confirmar seu e-mail. Toque abaixo para receber o código.';
  if (/Token has expired or is invalid|otp_expired|invalid.*otp/i.test(msg))
    return 'Código errado ou vencido. Confira o último e-mail ou peça outro código.';
  if (/only request this after (\d+) seconds/i.test(msg))
    return `Espere ${msg.match(/after (\d+) seconds/i)?.[1]} segundos para pedir outro código.`;
  if (/rate limit/i.test(msg)) return 'Muitos e-mails enviados agora. Tente de novo em alguns minutos.';
  if (/User already registered/i.test(msg)) return 'Esse e-mail já tem conta. Tente entrar.';
  if (/Password should be at least/i.test(msg)) return 'A senha precisa ter pelo menos 6 caracteres.';
  if (/maiores de 18/i.test(msg)) return 'O Cola Aqui é para maiores de 18 anos.';
  if (/Database error saving new user/i.test(msg))
    return 'Não deu para criar a conta. Confira o @ (3 a 24 letras minúsculas, números, _ ou .) e a data de nascimento.';
  if (/Network request failed|Failed to fetch/i.test(msg)) return 'Sem conexão. Confere a internet e tenta de novo.';
  if (/JWT|session/i.test(msg)) return 'Sua sessão expirou. Entre de novo.';
  return msg;
}

// ---------- "aberto agora" pelo horário informado (PRD 3.1) ----------
// Brasília não tem horário de verão desde 2019: UTC−3 fixo, independente do fuso do aparelho.
const BRT_MS = 3 * 3600 * 1000;

/** Dia da semana (0 = domingo) e minuto do dia em Brasília. */
export function agoraBrasilia(now: number = Date.now()) {
  const d = new Date(now - BRT_MS);
  return { weekday: d.getUTCDay(), min: d.getUTCHours() * 60 + d.getUTCMinutes() };
}

const paraMin = (t: string) => {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + (m || 0);
};

type Faixa = { weekday: number; opens: string; closes: string };

/**
 * Situação pelo horário informado. Fechamento menor ou igual à abertura = vira a noite
 * (ex.: 23:00–05:00 de sexta fica aberto até 05:00 de sábado).
 */
export function situacaoHorario(hours: Faixa[], now: number = Date.now()) {
  if (hours.length === 0) return null;
  const { weekday, min } = agoraBrasilia(now);
  const ontem = (weekday + 6) % 7;

  for (const h of hours) {
    const abre = paraMin(h.opens);
    const fecha = paraMin(h.closes);
    const vira = fecha <= abre;
    if (h.weekday === weekday && min >= abre && (vira || min < fecha)) {
      return { aberto: true, texto: `Aberto agora · fecha às ${horaCurta(h.closes)}` };
    }
    if (h.weekday === ontem && vira && min < fecha) {
      return { aberto: true, texto: `Aberto agora · fecha às ${horaCurta(h.closes)}` };
    }
  }
  const proxima = hours
    .filter((h) => h.weekday === weekday && paraMin(h.opens) > min)
    .sort((a, b) => paraMin(a.opens) - paraMin(b.opens))[0];
  if (proxima) return { aberto: false, texto: `Fechado agora · abre às ${horaCurta(proxima.opens)}` };
  return { aberto: false, texto: 'Fechado agora' };
}
