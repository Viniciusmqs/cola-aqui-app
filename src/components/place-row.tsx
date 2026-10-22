import { Link } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';

import { colors, placeKindLabel, radius, space } from '@/constants/theme';
import { distancia, haQuanto } from '@/lib/format';
import type { NearbyPlace } from '@/lib/types';

import { Txt } from './ui';

export function PlaceRow({ place }: { place: NearbyPlace }) {
  const ativo = place.registros_agora > 0;
  return (
    <Link href={{ pathname: '/lugar/[id]', params: { id: place.id } }} asChild>
      <Pressable style={({ pressed }) => [s.row, pressed && { opacity: 0.8 }]} accessibilityRole="link">
        <View style={[s.dot, { backgroundColor: ativo ? colors.pulso : colors.carvao3 }]} />
        <View style={{ flex: 1 }}>
          <Txt variant="label">{place.nome}</Txt>
          <Txt variant="small" color={colors.mut}>
            {placeKindLabel[place.tipo] ?? place.tipo}
            {place.bairro ? ` · ${place.bairro}` : ''} · {distancia(place.distancia_m)}
          </Txt>
        </View>
        <View style={{ alignItems: 'flex-end' }}>
          {ativo ? (
            <>
              <Txt variant="label" color={colors.pulso}>
                {place.registros_agora} {place.registros_agora === 1 ? 'registro' : 'registros'}
              </Txt>
              {place.ultimo_registro ? (
                <Txt variant="caption" color={colors.mut}>
                  último {haQuanto(place.ultimo_registro)}
                </Txt>
              ) : null}
            </>
          ) : (
            <Txt variant="caption" color={colors.mut}>
              sem registros agora
            </Txt>
          )}
        </View>
      </Pressable>
    </Link>
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
