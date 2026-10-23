import { useEffect } from 'react';
import { StyleSheet, View, type DimensionValue, type StyleProp, type ViewStyle } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

import { colors, radius, space } from '@/constants/theme';

/** Bloco de carregamento (esqueleto) que respira devagar; parado com "reduzir movimento". */
export function Bone({
  w = '100%',
  h = 14,
  r = radius.sm,
  style,
}: {
  w?: DimensionValue;
  h?: DimensionValue;
  r?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const reduce = useReducedMotion();
  const v = useSharedValue(0.55);
  useEffect(() => {
    if (!reduce) v.value = withRepeat(withTiming(1, { duration: 900 }), -1, true);
  }, [reduce, v]);
  const a = useAnimatedStyle(() => ({ opacity: v.value }));
  return (
    <Animated.View style={[{ width: w, height: h, borderRadius: r, backgroundColor: colors.carvao3 }, a, style]} />
  );
}

export function FeedCardSkeleton() {
  return (
    <View style={s.card} accessibilityLabel="Carregando vídeo">
      <View style={s.media}>
        <Bone w={170} h={26} r={radius.pill} style={{ margin: space.md }} />
      </View>
      <View style={s.info}>
        <Bone w="60%" h={22} />
        <Bone w="45%" />
        <Bone w="80%" />
      </View>
    </View>
  );
}

export function FeedSkeleton() {
  return (
    <View style={{ gap: space.md }}>
      <FeedCardSkeleton />
      <FeedCardSkeleton />
    </View>
  );
}

export function RowSkeleton() {
  return (
    <View style={s.row}>
      <Bone w={44} h={44} r={radius.md} />
      <View style={{ flex: 1, gap: 8 }}>
        <Bone w="55%" h={16} />
        <Bone w="35%" h={12} />
      </View>
    </View>
  );
}

export function PlaceSkeleton() {
  return (
    <View style={{ gap: space.md, padding: space.md }}>
      <Bone w="70%" h={30} />
      <Bone w="40%" />
      <View style={{ flexDirection: 'row', gap: space.sm, marginTop: space.md }}>
        <Bone w={200} h={356} r={radius.md} />
        <Bone w={200} h={356} r={radius.md} />
      </View>
      <Bone w="100%" h={52} r={radius.pill} />
    </View>
  );
}

const s = StyleSheet.create({
  card: { backgroundColor: colors.carvao2, borderRadius: radius.lg, overflow: 'hidden' },
  media: { aspectRatio: 4 / 5, backgroundColor: '#0E1513' },
  info: { padding: space.md, gap: 10 },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: space.sm },
});
