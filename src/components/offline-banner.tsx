import Ionicons from '@expo/vector-icons/Ionicons';
import { StyleSheet, View } from 'react-native';
import Animated, { FadeInUp, FadeOutUp } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors, radius, space } from '@/constants/theme';
import { useIsOffline } from '@/lib/network';

import { Txt } from './ui';

/** Aviso discreto de conexão (PRD 3.1: conexão instável em eventos). O app volta a buscar sozinho. */
export function OfflineBanner() {
  const offline = useIsOffline();
  const insets = useSafeAreaInsets();
  if (!offline) return null;
  return (
    <Animated.View
      entering={FadeInUp}
      exiting={FadeOutUp}
      style={[s.wrap, { top: insets.top + space.sm }]}
      pointerEvents="none"
      accessibilityLiveRegion="polite">
      <View style={s.pill}>
        <Ionicons name="cloud-offline-outline" size={16} color={colors.carvao} />
        <Txt variant="small" color={colors.carvao}>
          Sem conexão. Mostrando o que já carregou.
        </Txt>
      </View>
    </Animated.View>
  );
}

const s = StyleSheet.create({
  wrap: { position: 'absolute', left: 0, right: 0, alignItems: 'center', zIndex: 40 },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.algodao,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: radius.pill,
  },
});
