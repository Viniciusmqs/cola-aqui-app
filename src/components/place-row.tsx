import { router } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';

import { categoryLabel, colors, radius, space } from '@/constants/theme';
import { distancia, tempoDesde } from '@/lib/format';
import type { NearbyPlace } from '@/lib/types';

import { Txt } from './ui';

/** Lugar em lista. Sem post recente: "Sem atualização recente", nunca movimento simulado (PRD 3.1, QA-12). */
export function PlaceRow({ place }: { place: NearbyPlace }) {
  const recente = place.fresh_posts > 0;
  return (
    <Pressable
      onPress={() => router.push({ pathname: '/lugar/[id]', params: { id: place.id } })}
      style={({ pressed }) => [s.row, pressed && { opacity: 0.8 }]}
      accessibilityRole="link">
      <View style={[s.dot, { backgroundColor: recente ? colors.pulso : colors.carvao3 }]} />
      <View style={{ flex: 1 }}>
        <Txt variant="label" numberOfLines={1}>
          {place.name}
        </Txt>
        <Txt variant="small" color={colors.mut} numberOfLines={1}>
          {categoryLabel[place.category] ?? place.category}
          {place.neighborhood ? ` · ${place.neighborhood}` : ''} · {distancia(place.distance_m)}
        </Txt>
      </View>
      <View style={{ alignItems: 'flex-end', maxWidth: 130 }}>
        {recente ? (
          <Txt variant="small" color={colors.pulso}>
            {place.fresh_posts === 1 ? '1 vídeo recente' : `${place.fresh_posts} vídeos recentes`}
          </Txt>
        ) : (
          <Txt variant="caption" color={colors.mut} style={{ textAlign: 'right' }}>
            {place.last_published_at
              ? `Último vídeo ${tempoDesde(place.last_published_at)}`
              : 'Sem atualização recente'}
          </Txt>
        )}
      </View>
    </Pressable>
  );
}

const s = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    padding: space.md,
    backgroundColor: colors.carvao2,
    borderRadius: radius.md,
  },
  dot: { width: 10, height: 10, borderRadius: 5 },
});
