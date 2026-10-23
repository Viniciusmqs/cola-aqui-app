import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { FlatList, Pressable, StyleSheet, useWindowDimensions, View, type ListViewToken } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { colors, radius, space } from '@/constants/theme';
import { useRegion } from '@/lib/region';

import { BrandLogo, BrandSymbol, PulseDot } from './brand';
import { Button, Txt } from './ui';

type Slide = { key: string; title: string; text: string; icon: 'video' | 'clock' | 'pin' };

const SLIDES: Slide[] = [
  {
    key: 'ver',
    icon: 'video',
    title: 'Veja antes de sair de casa.',
    text: 'Vídeos curtos de quem está nos bares, shows e eventos de Brasília mostram como o lugar está.',
  },
  {
    key: 'tempo',
    icon: 'clock',
    title: 'Sempre com o horário.',
    text: 'Cada vídeo mostra há quanto tempo foi publicado e quem publicou: usuário, criador ou o próprio lugar.',
  },
  {
    key: 'local',
    icon: 'pin',
    title: 'O que está perto de você.',
    text: 'Com a localização, mostramos primeiro o que está mais perto. Ela fica só no seu aparelho e nunca aparece nos vídeos.',
  },
];

function Illustration({ icon }: { icon: Slide['icon'] }) {
  if (icon === 'video') {
    return (
      <View style={s.ill}>
        <BrandSymbol size={132} />
      </View>
    );
  }
  if (icon === 'clock') {
    return (
      <View style={s.ill}>
        <View style={s.tagDemo}>
          <PulseDot />
          <Txt variant="label">Publicado há 8 min · Usuário</Txt>
        </View>
        <View style={[s.tagDemo, { opacity: 0.55 }]}>
          <PulseDot color={colors.mut} active={false} />
          <Txt variant="label">Publicado há 2 h · Estabelecimento</Txt>
        </View>
      </View>
    );
  }
  return (
    <View style={s.ill}>
      <View style={s.pinRing}>
        <Ionicons name="navigate" size={54} color={colors.pulso} />
      </View>
    </View>
  );
}

/** Boas-vindas na primeira abertura: 3 telas curtas, pular a qualquer momento, permissão explicada antes do pedido. */
export function Onboarding({ onDone }: { onDone: () => void }) {
  const { width } = useWindowDimensions();
  const [page, setPage] = useState(0);
  const [pedindo, setPedindo] = useState(false);
  const list = useRef<FlatList<Slide>>(null);
  const { ativarGps } = useRegion();
  const ultima = page === SLIDES.length - 1;

  const onViewable = useCallback(({ viewableItems }: { viewableItems: ListViewToken[] }) => {
    const i = viewableItems[0]?.index;
    if (i != null) setPage(i);
  }, []);

  const avancar = () => list.current?.scrollToIndex({ index: page + 1, animated: true });

  const permitir = async () => {
    setPedindo(true);
    await ativarGps();
    setPedindo(false);
    onDone();
  };

  const escolherRegiao = () => {
    onDone();
    router.push('/regiao');
  };

  return (
    <Animated.View entering={FadeIn.duration(250)} style={[StyleSheet.absoluteFill, s.root]}>
      <SafeAreaView style={{ flex: 1 }}>
        <View style={s.header}>
          <BrandLogo height={24} />
          {!ultima ? (
            <Pressable
              onPress={() => list.current?.scrollToEnd({ animated: true })}
              hitSlop={12}
              accessibilityRole="button">
              <Txt variant="label" color={colors.mut}>
                Pular
              </Txt>
            </Pressable>
          ) : null}
        </View>
        <FlatList
          ref={list}
          data={SLIDES}
          horizontal
          pagingEnabled
          bounces={false}
          showsHorizontalScrollIndicator={false}
          keyExtractor={(i) => i.key}
          onViewableItemsChanged={onViewable}
          viewabilityConfig={{ itemVisiblePercentThreshold: 60 }}
          getItemLayout={(_, index) => ({ length: width, offset: width * index, index })}
          renderItem={({ item }) => (
            <View style={[s.slide, { width }]}>
              <Illustration icon={item.icon} />
              <Txt variant="display" style={s.title}>
                {item.title}
              </Txt>
              <Txt color={colors.mut} style={s.text}>
                {item.text}
              </Txt>
            </View>
          )}
        />
        <View style={s.footer}>
          <View style={s.dots} accessibilityLabel={`Tela ${page + 1} de ${SLIDES.length}`}>
            {SLIDES.map((sl, i) => (
              <View key={sl.key} style={[s.dot, i === page && s.dotOn]} />
            ))}
          </View>
          {ultima ? (
            <View style={{ gap: space.sm }}>
              <Button title="Usar minha localização" onPress={permitir} loading={pedindo} />
              <Button title="Escolher região" kind="ghost" onPress={escolherRegiao} />
            </View>
          ) : (
            <Button title="Continuar" onPress={avancar} />
          )}
        </View>
      </SafeAreaView>
    </Animated.View>
  );
}

const s = StyleSheet.create({
  root: { backgroundColor: colors.carvao, zIndex: 50 },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
  },
  slide: { paddingHorizontal: space.lg, justifyContent: 'center', gap: space.md },
  ill: { height: 220, alignItems: 'center', justifyContent: 'center', gap: space.md },
  tagDemo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: colors.carvao2,
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: radius.pill,
  },
  pinRing: {
    width: 132,
    height: 132,
    borderRadius: 66,
    borderWidth: 2,
    borderColor: colors.carvao3,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { marginTop: space.lg },
  text: { fontSize: 17, lineHeight: 25 },
  footer: { paddingHorizontal: space.lg, paddingBottom: space.lg, gap: space.lg },
  dots: { flexDirection: 'row', gap: 6, justifyContent: 'center' },
  dot: { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.carvao3 },
  dotOn: { width: 22, backgroundColor: colors.pulso },
});
