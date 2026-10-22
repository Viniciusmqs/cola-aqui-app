/** "há X min" — o app nunca diz "ao vivo" (regra do manual). */
export function haQuanto(iso: string, now: number = Date.now()) {
  const diff = Math.max(0, now - new Date(iso).getTime());
  const min = Math.floor(diff / 60000);
  if (min < 1) return 'agora há pouco';
  if (min < 60) return `há ${min} min`;
  const h = Math.floor(min / 60);
  const resto = min % 60;
  return resto ? `há ${h} h ${resto} min` : `há ${h} h`;
}

export function distancia(m: number) {
  if (m < 1000) return `${Math.round(m / 10) * 10} m`;
  return `${(m / 1000).toFixed(m < 10000 ? 1 : 0).replace('.', ',')} km`;
}

/** Idade completa a partir de AAAA-MM-DD. */
export function idade(nascimento: string, hoje = new Date()) {
  const [a, m, d] = nascimento.split('-').map(Number);
  let anos = hoje.getFullYear() - a;
  const mes = hoje.getMonth() + 1;
  if (mes < m || (mes === m && hoje.getDate() < d)) anos -= 1;
  return anos;
}

/** Converte DD/MM/AAAA em AAAA-MM-DD; devolve null se inválida. */
export function parseDataBR(txt: string) {
  const m = txt.trim().match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!m) return null;
  const [, d, mo, a] = m;
  const date = new Date(Number(a), Number(mo) - 1, Number(d));
  if (date.getFullYear() !== Number(a) || date.getMonth() !== Number(mo) - 1 || date.getDate() !== Number(d)) {
    return null;
  }
  return `${a}-${mo}-${d}`;
}

/** Erros do Supabase/Postgres em português amigável. */
export function mensagemDeErro(e: unknown) {
  const msg = e instanceof Error ? e.message : typeof e === 'object' && e && 'message' in e ? String((e as { message: unknown }).message) : String(e);
  if (/Invalid login credentials/i.test(msg)) return 'E-mail ou senha incorretos.';
  if (/Email not confirmed/i.test(msg)) return 'Confirme seu e-mail pelo link que enviamos antes de entrar.';
  if (/User already registered/i.test(msg)) return 'Esse e-mail já tem conta. Tente entrar.';
  if (/Password should be at least/i.test(msg)) return 'A senha precisa ter pelo menos 6 caracteres.';
  if (/profiles_username_key|duplicate key.*username/i.test(msg)) return 'Esse @ já está em uso.';
  if (/Database error saving new user/i.test(msg)) return 'Não deu para criar a conta. Confira o @ (3 a 24 letras, números, _ ou .) e a data de nascimento.';
  if (/Network request failed|Failed to fetch/i.test(msg)) return 'Sem conexão. Tenta de novo.';
  return msg;
}
