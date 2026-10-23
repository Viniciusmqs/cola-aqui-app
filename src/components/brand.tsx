import { useEffect, useState } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, {
  Easing,
  runOnJS,
  useAnimatedProps,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Circle, G, Path } from 'react-native-svg';

import {
  LOGO_SYMBOL_TRANSFORM,
  LOGO_VIEWBOX,
  PERIOD,
  SYMBOL_ARC,
  SYMBOL_DOT,
  WORDMARK_OFFSET_X,
  WORDMARK_PATH,
} from '@/constants/brand-paths';
import { colors } from '@/constants/theme';

/** Movimentos oficiais (tokens.json do pacote visual). */
export const motion = {
  chegada: 1700,
  pulso: { ms: 1800, easing: Easing.bezier(0.22, 1, 0.36, 1) },
  quique: { ms: 320, easing: Easing.bezier(0.34, 1.56, 0.64, 1) },
  cola: { ms: 1100, easing: Easing.bezier(0.65, 0, 0.35, 1) },
};

const ARC_LENGTH = 166; // comprimento do arco do "C" (raio 44, ~215°)

/** Logotipo horizontal oficial (noturno por padrão). */
export function BrandLogo({ height = 28, wordColor = colors.neblina }: { height?: number; wordColor?: string }) {
  const width = (height * 880) / 176;
  return (
    <Svg width={width} height={height} viewBox={LOGO_VIEWBOX} accessibilityLabel="Cola Aqui">
      <G transform={LOGO_SYMBOL_TRANSFORM}>
        <Path d={SYMBOL_ARC} fill="none" stroke={colors.pulso} strokeWidth={19} strokeLinecap="round" />
        <Circle cx={SYMBOL_DOT.cx} cy={SYMBOL_DOT.cy} r={SYMBOL_DOT.r} fill={colors.rosa} />
      </G>
      <G transform={`translate(${WORDMARK_OFFSET_X} 0)`}>
        <Path d={WORDMARK_PATH} fill={wordColor} />
      </G>
      <Circle cx={PERIOD.cx} cy={PERIOD.cy} r={PERIOD.r} fill={colors.rosa} />
    </Svg>
  );
}

/** Símbolo oficial: o "C" que acolhe o ponto. */
export function BrandSymbol({ size = 40, mono }: { size?: number; mono?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 256 256">
      <G transform="translate(12 12) scale(1.8125)">
        <Path d={SYMBOL_ARC} fill="none" stroke={mono ?? colors.pulso} strokeWidth={19} strokeLinecap="round" />
        <Circle cx={SYMBOL_DOT.cx} cy={SYMBOL_DOT.cy} r={SYMBOL_DOT.r} fill={mono ?? colors.rosa} />
      </G>
    </Svg>
  );
}

/** Carregando oficial: o símbolo gira com a curva "Cola". */
export function BrandSpinner({ size = 40, style }: { size?: number; style?: StyleProp<ViewStyle> }) {
  const reduce = useReducedMotion();
  const rot = useSharedValue(0);
  useEffect(() => {
    rot.value = withRepeat(
      withTiming(360, {
        duration: reduce ? 4000 : motion.cola.ms,
        easing: reduce ? Easing.linear : motion.cola.easing,
      }),
      -1,
    );
  }, [reduce, rot]);
  const st = useAnimatedStyle(() => ({ transform: [{ rotate: `${rot.value}deg` }] }));
  return (
    <Animated.View
      style={[{ width: size, height: size }, st, style]}
      accessibilityLabel="Carregando"
      accessibilityRole="progressbar">
      <BrandSymbol size={size} />
    </Animated.View>
  );
}

/** Ponto "recente": pulsa devagar (gesto Pulso). Nunca significa "ao vivo". */
export function PulseDot({
  color = colors.pulso,
  size = 7,
  active = true,
}: {
  color?: string;
  size?: number;
  active?: boolean;
}) {
  const reduce = useReducedMotion();
  const s = useSharedValue(0);
  useEffect(() => {
    if (!active || reduce) return;
    s.value = withRepeat(withTiming(1, { duration: motion.pulso.ms, easing: motion.pulso.easing }), -1);
  }, [active, reduce, s]);
  const halo = useAnimatedStyle(() => ({ opacity: 0.6 * (1 - s.value), transform: [{ scale: 1 + s.value * 1.6 }] }));
  return (
    <View style={{ width: size, height: size }}>
      {active && !reduce ? (
        <Animated.View style={[StyleSheet.absoluteFill, { borderRadius: size, backgroundColor: color }, halo]} />
      ) : null}
      <View style={[StyleSheet.absoluteFill, { borderRadius: size, backgroundColor: color }]} />
    </View>
  );
}

const APath = Animated.createAnimatedComponent(Path);
const ACircle = Animated.createAnimatedComponent(Circle);
const AG = Animated.createAnimatedComponent(G);

/**
 * Abertura animada (gesto "Chegada", 1,7 s): o C se desenha, o ponto cai e quica,
 * o nome sobe e o ponto final aparece. Com "reduzir movimento", só um fade.
 */
export function BrandIntro({ onDone }: { onDone: () => void }) {
  const reduce = useReducedMotion();
  const draw = useSharedValue(reduce ? 1 : 0);
  const drop = useSharedValue(reduce ? 1 : 0);
  const word = useSharedValue(reduce ? 1 : 0);
  const period = useSharedValue(reduce ? 1 : 0);
  const fade = useSharedValue(1);
  const [width] = useState(280);

  useEffect(() => {
    const finish = () => {
      fade.value = withTiming(0, { duration: 320 }, (ok) => {
        if (ok) runOnJS(onDone)();
      });
    };
    if (reduce) {
      const t = setTimeout(finish, 600);
      return () => clearTimeout(t);
    }
    draw.value = withDelay(50, withTiming(1, { duration: 700, easing: motion.cola.easing }));
    drop.value = withDelay(500, withTiming(1, { duration: 750, easing: motion.quique.easing }));
    word.value = withDelay(750, withTiming(1, { duration: 550, easing: motion.pulso.easing }));
    period.value = withDelay(1250, withSequence(withTiming(1.25, { duration: 260 }), withTiming(1, { duration: 190 })));
    const t = setTimeout(finish, motion.chegada + 150);
    return () => clearTimeout(t);
  }, [reduce, draw, drop, word, period, fade, onDone]);

  const arcProps = useAnimatedProps(() => ({ strokeDashoffset: ARC_LENGTH * (1 - draw.value) }));
  const dotProps = useAnimatedProps(() => ({
    cy: SYMBOL_DOT.cy - 70 * (1 - drop.value),
    opacity: drop.value > 0 ? 1 : 0,
  }));
  const wordProps = useAnimatedProps(() => ({ opacity: word.value, y: 22 * (1 - word.value) }));
  const periodProps = useAnimatedProps(() => ({ r: PERIOD.r * period.value }));
  const container = useAnimatedStyle(() => ({ opacity: fade.value }));

  return (
    <Animated.View style={[StyleSheet.absoluteFill, s.intro, container]} pointerEvents="none">
      <Svg width={width} height={(width * 176) / 880} viewBox={LOGO_VIEWBOX} accessibilityLabel="Cola Aqui">
        <G transform={LOGO_SYMBOL_TRANSFORM}>
          <APath
            d={SYMBOL_ARC}
            fill="none"
            stroke={colors.pulso}
            strokeWidth={19}
            strokeLinecap="round"
            strokeDasharray={`${ARC_LENGTH} ${ARC_LENGTH}`}
            animatedProps={arcProps}
          />
          <ACircle cx={SYMBOL_DOT.cx} r={SYMBOL_DOT.r} fill={colors.rosa} animatedProps={dotProps} />
        </G>
        <G transform={`translate(${WORDMARK_OFFSET_X} 0)`}>
          <AG animatedProps={wordProps}>
            <Path d={WORDMARK_PATH} fill={colors.neblina} />
          </AG>
        </G>
        <ACircle cx={PERIOD.cx} cy={PERIOD.cy} fill={colors.rosa} animatedProps={periodProps} />
      </Svg>
    </Animated.View>
  );
}

const s = StyleSheet.create({
  intro: { backgroundColor: colors.carvao, alignItems: 'center', justifyContent: 'center', zIndex: 100 },
});
