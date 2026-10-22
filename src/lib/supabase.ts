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

/** URLs temporárias para uma lista de arquivos (uma chamada só). */
export async function signedUrls(paths: string[]) {
  const unique = [...new Set(paths)];
  if (unique.length === 0) return new Map<string, string>();
  const { data } = await supabase.storage.from(MEDIA_BUCKET).createSignedUrls(unique, 60 * 60);
  const map = new Map<string, string>();
  for (const item of data ?? []) if (item.path && item.signedUrl) map.set(item.path, item.signedUrl);
  return map;
}
