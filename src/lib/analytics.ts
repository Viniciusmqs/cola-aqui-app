import AsyncStorage from '@react-native-async-storage/async-storage';

import { supabase } from './supabase';

/**
 * Eventos de produto (PRD 8.3). O servidor aceita só eventos conhecidos, deduplica impressões
 * e nunca grava coordenadas. "route_click" é intenção, não visita.
 */
export type EventName =
  'feed_item_impression' | 'place_view' | 'post_play' | 'post_complete' | 'place_save' | 'share_click' | 'route_click';

let anonId: string | null = null;
async function getAnonId() {
  if (anonId) return anonId;
  try {
    anonId = await AsyncStorage.getItem('colaaqui.anon');
    if (!anonId) {
      anonId = `a_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
      await AsyncStorage.setItem('colaaqui.anon', anonId);
    }
  } catch {
    anonId = `a_${Math.random().toString(36).slice(2, 12)}`;
  }
  return anonId;
}

export async function track(
  event: EventName,
  ids: { place?: string; post?: string } = {},
  props: Record<string, unknown> = {},
) {
  try {
    await supabase.rpc('track_event', {
      p_event: event,
      p_place: ids.place ?? null,
      p_post: ids.post ?? null,
      p_anon_id: await getAnonId(),
      p_props: props,
    });
  } catch {
    // métrica nunca pode quebrar a experiência
  }
}
