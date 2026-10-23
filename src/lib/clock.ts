import { useSyncExternalStore } from 'react';

import { supabase } from './supabase';

/**
 * Relógio do app corrigido pelo servidor. O "Publicado há X min" usa a hora do servidor, não a do
 * celular: um aparelho 5 min adiantado mostraria vídeos "mais velhos" do que são (PRD 5.1).
 * Um relógio único atualiza todos os rótulos a cada 30 s, sem um timer por cartão.
 */
let skewMs = 0;
let synced = false;

export function serverNow() {
  return Date.now() + skewMs;
}

/** Mede a diferença uma vez por abertura (descontando metade do tempo de ida e volta). */
export async function syncClock() {
  try {
    const t0 = Date.now();
    const { data, error } = await supabase.rpc('server_time');
    const t1 = Date.now();
    if (error || !data) return;
    const server = new Date(data as string).getTime();
    if (Number.isFinite(server)) {
      skewMs = server - (t0 + t1) / 2;
      synced = true;
      emit();
    }
  } catch {
    // sem rede: segue com o relógio do aparelho
  }
}

/** Ajusta a diferença a partir de uma resposta que já traz a hora do servidor (sem chamada extra). */
export function adjustFromServer(serverIso: string | null | undefined, requestStartedAt: number) {
  if (!serverIso || synced) return;
  const server = new Date(serverIso).getTime();
  if (!Number.isFinite(server)) return;
  skewMs = server - (requestStartedAt + Date.now()) / 2;
  synced = true;
  emit();
}

const listeners = new Set<() => void>();
let tick = serverNow();
let timer: ReturnType<typeof setInterval> | null = null;

function emit() {
  tick = serverNow();
  for (const l of listeners) l();
}

function subscribe(l: () => void) {
  listeners.add(l);
  if (!timer) timer = setInterval(emit, 30_000);
  return () => {
    listeners.delete(l);
    if (listeners.size === 0 && timer) {
      clearInterval(timer);
      timer = null;
    }
  };
}

/** Hora do servidor, atualizada a cada 30 s. Use para rótulos de tempo que precisam andar sozinhos. */
export function useNow() {
  return useSyncExternalStore(
    subscribe,
    () => tick,
    () => tick,
  );
}

/** Força uma atualização imediata (ex.: o app voltou do segundo plano). */
export function refreshNow() {
  emit();
}
