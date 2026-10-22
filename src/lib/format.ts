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
export function rotuloPublicacao(iso: string, origin: PostOrigin) {
  return `Publicado ${tempoDesde(iso)} · ${origemLabel[origin]}`;
}

export function distancia(m: number) {
  if (m < 1000) return `${Math.max(10, Math.round(m / 10) * 10)} m`;
  return `${(m / 1000).toFixed(m < 10000 ? 1 : 0).replace('.', ',')} km`;
}

const DIAS = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
export const diaSemana = (n: number) => DIAS.at(n) ?? '';

export function dataEvento(iso: string) {
  const d = new Date(iso);
  const hoje = new Date();
  const amanha = new Date(Date.now() + 86400000);
  const hora = d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  if (d.toDateString() === hoje.toDateString()) return `Hoje · ${hora}`;
  if (d.toDateString() === amanha.toDateString()) return `Amanhã · ${hora}`;
  return `${diaSemana(d.getDay())}, ${d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })} · ${hora}`;
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
  if (/Email not confirmed/i.test(msg)) return 'Confirme seu e-mail pelo link que enviamos antes de entrar.';
  if (/User already registered/i.test(msg)) return 'Esse e-mail já tem conta. Tente entrar.';
  if (/Password should be at least/i.test(msg)) return 'A senha precisa ter pelo menos 6 caracteres.';
  if (/maiores de 18/i.test(msg)) return 'O Cola Aqui é para maiores de 18 anos.';
  if (/Database error saving new user/i.test(msg))
    return 'Não deu para criar a conta. Confira o @ (3 a 24 letras minúsculas, números, _ ou .) e a data de nascimento.';
  if (/Network request failed|Failed to fetch/i.test(msg)) return 'Sem conexão. Confere a internet e tenta de novo.';
  if (/JWT|session/i.test(msg)) return 'Sua sessão expirou. Entre de novo.';
  return msg;
}
