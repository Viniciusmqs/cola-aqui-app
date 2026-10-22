import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { Pressable, StyleSheet } from 'react-native';

import { colors, radius } from '@/constants/theme';
import { useRegion } from '@/lib/region';

import { Txt } from './ui';

/** A região escolhida fica sempre visível e pode ser trocada (RF-01). */
export function RegionChip() {
  const { label, mode } = useRegion();
  return (
    <Pressable
      onPress={() => router.push('/regiao')}
      style={s.chip}
      accessibilityRole="button"
      accessibilityLabel={`Região: ${label}. Toque para trocar`}>
      <Ionicons name={mode === 'gps' ? 'navigate' : 'location-outline'} size={14} color={colors.pulso} />
      <Txt variant="small" numberOfLines={1} style={{ maxWidth: 160 }}>
        {label}
      </Txt>
      <Ionicons name="chevron-down" size={14} color={colors.mut} />
    </Pressable>
  );
}

const s = StyleSheet.create({
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.carvao2,
    borderRadius: radius.pill,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
});
