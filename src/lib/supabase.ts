import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import { AppState, Platform } from 'react-native';

/**
 * A chave publicável pode ficar no app: o acesso aos dados é protegido por RLS no banco.
 * Para apontar para outro projeto, defina EXPO_PUBLIC_SUPABASE_URL e EXPO_PUBLIC_SUPABASE_KEY no .env.
 */
export const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL ?? 'https://uubcewubxdwvjtxfdjcs.supabase.co';
const SUPABASE_KEY = process.env.EXPO_PUBLIC_SUPABASE_KEY ?? 'sb_publishable_Zz8NVmqkBOZUMdf8ZbkYsQ_lNWblzIc';

const isServer = Platform.OS === 'web' && typeof window === 'undefined';

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: {
    storage: isServer ? undefined : AsyncStorage,
    autoRefreshToken: !isServer,
    persistSession: !isServer,
    detectSessionInUrl: false,
  },
});

if (Platform.OS !== 'web') {
  AppState.addEventListener('change', (state) => {
    if (state === 'active') supabase.auth.startAutoRefresh();
    else supabase.auth.stopAutoRefresh();
  });
}

/** Bucket privado: o vídeo só é entregue quando a publicação está aprovada (QA-05). */
export const MEDIA_BUCKET = 'media';

/**
 * URLs temporárias para uma lista de arquivos (uma chamada só).
 * Links valem 3 h e ficam guardados em memória: o mesmo arquivo recebe o mesmo link enquanto
 * faltar mais de 1 h para vencer, então a miniatura vem do cache e o vídeo não recarrega a cada página.
 */
const VALIDADE_S = 3 * 60 * 60; // curto o bastante para um vídeo removido não circular por muito tempo
const MARGEM_MS = 60 * 60 * 1000;
const cache = new Map<string, { url: string; vence: number }>();

export async function signedUrls(paths: string[]) {
  const unique = [...new Set(paths)];
  const map = new Map<string, string>();
  const agora = Date.now();
  const faltam: string[] = [];
  for (const p of unique) {
    const c = cache.get(p);
    if (c && c.vence - agora > MARGEM_MS) map.set(p, c.url);
    else faltam.push(p);
  }
  if (faltam.length === 0) return map;
  const { data } = await supabase.storage.from(MEDIA_BUCKET).createSignedUrls(faltam, VALIDADE_S);
  for (const item of data ?? []) {
    if (item.path && item.signedUrl) {
      map.set(item.path, item.signedUrl);
      cache.set(item.path, { url: item.signedUrl, vence: agora + VALIDADE_S * 1000 });
    }
  }
  if (cache.size > 2000) cache.clear();
  return map;
}
