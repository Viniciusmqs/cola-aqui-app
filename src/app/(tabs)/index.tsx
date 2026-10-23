import Ionicons from '@expo/vector-icons/Ionicons';
import { Image } from 'expo-image';
import * as Haptics from 'expo-haptics';
import { router, useIsFocused } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AppState,
  FlatList,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  View,
  type ListViewToken,
} from 'react-native';
import Animated, { FadeInUp, FadeOutUp } from 'react-native-reanimated';

import { FeedCard } from '@/components/post-card';
import { PlaceRow } from '@/components/place-row';
import { RegionChip } from '@/components/region-chip';
import { FeedSkeleton } from '@/components/skeleton';
import { Button, Chip, Empty, Logo, Screen, Txt } from '@/components/ui';
import { categoryFilters, categoryLabel, colors, radius, space } from '@/constants/theme';
import { track } from '@/lib/analytics';
import { refreshNow, syncClock } from '@/lib/clock';
import { useExploreFeed, useNewPosts, usePlacesNearby } from '@/lib/queries';
import type { FeedItem, FeedMode } from '@/lib/types';

const MODOS: { key: FeedMode; label: string }[] = [
  { key: 'agora', label: 'Agora' },
  { key: 'hoje', label: 'Hoje' },
];

/** Depois de tanto tempo em segundo plano, o feed volta com uma foto nova (os vídeos já envelheceram). */
const VOLTA_ATUALIZA_MS = 10 * 60_000;

export default function Explorar() {
  const [mode, setMode] = useState<FeedMode>('agora');
  const [category, setCategory] = useState<string | null>(null);
  const [foto, setFoto] = useState(0);
  const novaFoto = () => setFoto((f) => f + 1);
  const [visivelIdx, setVisivelIdx] = useState(0);
  const [puxouNaFoto, setPuxouNaFoto] = useState(-1);
  const focado = useIsFocused();
  const lista = useRef<FlatList<FeedItem>>(null);

  const feed = useExploreFeed(mode, category, foto);
  const lugares = usePlacesNearby({ category });
  const trocando = feed.isPlaceholderData; // foto nova a caminho, lista antiga ainda na tela
  const asOf = trocando ? null : (feed.data?.pages[0]?.asOf ?? null);
  const novos = useNewPosts(category, asOf, focado && !feed.isLoading);

  // sem repetidos, mesmo se duas páginas se cruzarem
  const itens = useMemo(() => {
    const vistos = new Set<string>();
    const out: FeedItem[] = [];
    for (const it of feed.data?.pages.flatMap((p) => p.rows) ?? []) {
      if (!vistos.has(it.id)) {
        vistos.add(it.id);
        out.push(it);
      }
    }
    return out;
  }, [feed.data]);

  // relógio do servidor uma vez por abertura
  useEffect(() => {
    syncClock();
  }, []);

  // voltou do segundo plano: atualiza os rótulos de tempo e, se ficou muito tempo fora, tira foto nova
  useEffect(() => {
    let saiuEm = 0;
    const sub = AppState.addEventListener('change', (st) => {
      if (st === 'active') {
        refreshNow();
        if (saiuEm && Date.now() - saiuEm > VOLTA_ATUALIZA_MS) {
          novaFoto();
          lista.current?.scrollToOffset({ offset: 0, animated: false });
        }
      } else saiuEm = Date.now();
    });
    return () => sub.remove();
  }, []);

  // miniaturas dos próximos cartões já ficam no cache (a rolagem não mostra cartão vazio)
  useEffect(() => {
    const urls = itens
      .slice(visivelIdx + 1, visivelIdx + 6)
      .map((i) => i.thumb_url)
      .filter((u): u is string => !!u);
    if (urls.length) Image.prefetch(urls).catch(() => {});
  }, [itens, visivelIdx]);

  const onViewable = useCallback(
    ({ viewableItems }: { viewableItems: ListViewToken[] }) => {
      const primeiro = viewableItems.find((v) => v.index != null);
      if (primeiro?.index != null) setVisivelIdx(primeiro.index);
      for (const v of viewableItems) {
        const it = v.item as FeedItem;
        track('feed_item_impression', { post: it.id, place: it.place_id }, { pos: it.rank_pos, modo: mode });
      }
    },
    [mode],
  );

  const atualizar = useCallback(
    async (origem: 'puxar' | 'aviso') => {
      if (origem === 'aviso') Haptics.selectionAsync().catch(() => {});
      lista.current?.scrollToOffset({ offset: 0, animated: true });
      if (origem === 'puxar') setPuxouNaFoto(foto + 1);
      novaFoto();
      lugares.refetch();
    },
    [lugares, foto],
  );
  const atualizando = puxouNaFoto === foto && trocando;

  const trocarModo = (m: FeedMode) => {
    if (m === mode) return;
    Haptics.selectionAsync().catch(() => {});
    setMode(m);
    novaFoto();
    setVisivelIdx(0);
    lista.current?.scrollToOffset({ offset: 0, animated: false });
  };
  const trocarCategoria = (c: string) => {
    Haptics.selectionAsync().catch(() => {});
    setCategory(category === c ? null : c);
    novaFoto();
    setVisivelIdx(0);
    lista.current?.scrollToOffset({ offset: 0, animated: false });
  };

  const vazio = !feed.isLoading && !feed.isError && itens.length === 0;
  const qtdNovos = novos.data ?? 0;

  const header = (
    <View style={{ gap: space.md, paddingBottom: space.md }}>
      <View style={s.top}>
        <Logo />
        <View style={s.topRight}>
          <RegionChip />
          <Pressable
            onPress={() => router.push('/buscar')}
            style={s.search}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="Buscar lugar">
            <Ionicons name="search" size={18} color={colors.neblina} />
          </Pressable>
        </View>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.chips}>
        {MODOS.map((m) => (
          <Chip key={m.key} label={m.label} active={mode === m.key} onPress={() => trocarModo(m.key)} />
        ))}
        <View style={s.sep} />
        {categoryFilters.map((c) => (
          <Chip
            key={c}
            tone="rosa"
            label={categoryLabel[c]}
            active={category === c}
            onPress={() => trocarCategoria(c)}
          />
        ))}
      </ScrollView>
    </View>
  );

  return (
    <Screen>
      <FlatList
        ref={lista}
        data={itens}
        keyExtractor={(i) => i.id}
        renderItem={({ item, index }) => (
          <FeedCard
            item={item}
            // só toca com a aba aberta: nada de áudio por trás da tela cheia ou de outra aba
            playing={focado && index === visivelIdx}
            near={Math.abs(index - visivelIdx) <= 1}
          />
        )}
        ItemSeparatorComponent={Separador}
        contentContainerStyle={{ paddingHorizontal: space.md, paddingBottom: space.xl }}
        ListHeaderComponent={header}
        onViewableItemsChanged={onViewable}
        viewabilityConfig={{ itemVisiblePercentThreshold: 65, minimumViewTime: 250 }}
        onEndReached={() => feed.hasNextPage && !feed.isFetchingNextPage && feed.fetchNextPage()}
        onEndReachedThreshold={1.5}
        initialNumToRender={3}
        maxToRenderPerBatch={3}
        windowSize={7}
        removeClippedSubviews
        refreshControl={
          <RefreshControl refreshing={atualizando} onRefresh={() => atualizar('puxar')} tintColor={colors.pulso} />
        }
        ListEmptyComponent={
          feed.isLoading ? (
            <FeedSkeleton />
          ) : feed.isError ? (
            <Empty
              title="Não deu para carregar"
              text="Confere sua conexão e tenta de novo."
              action={<Button title="Tentar de novo" kind="secondary" onPress={() => feed.refetch()} />}
            />
          ) : undefined
        }
        ListFooterComponent={
          vazio ? (
            // Feed vazio: honestidade sobre a ausência de vídeos + lugares que existem (PRD 3.1)
            <View style={{ gap: space.sm }}>
              <Txt variant="title">{mode === 'agora' ? 'Nenhum vídeo na última hora' : 'Nenhum vídeo hoje'}</Txt>
              <Txt color={colors.mut} style={{ marginBottom: space.sm }}>
                Ainda não publicaram {mode === 'agora' ? 'na última hora' : 'hoje'} nessa região. Veja os lugares e o
                que eles têm programado.
              </Txt>
              {mode === 'agora' ? (
                <Button title="Ver vídeos de hoje" kind="secondary" onPress={() => trocarModo('hoje')} />
              ) : null}
              <Button title="Seja o primeiro a publicar" onPress={() => router.push('/publicar')} />
              <View style={{ height: space.sm }} />
              {(lugares.data ?? []).slice(0, 15).map((p) => (
                <PlaceRow key={p.id} place={p} />
              ))}
            </View>
          ) : feed.isFetchingNextPage ? (
            <View style={{ marginTop: space.md }}>
              <FeedSkeleton />
            </View>
          ) : !feed.hasNextPage && itens.length > 0 ? (
            <Txt variant="small" color={colors.mut} style={s.fim}>
              {mode === 'agora'
                ? 'Você viu tudo da última hora por aqui. Puxe para atualizar ou veja os vídeos de hoje.'
                : 'Você viu tudo de hoje por aqui.'}
            </Txt>
          ) : undefined
        }
      />
      {qtdNovos > 0 && !trocando ? (
        <Animated.View entering={FadeInUp} exiting={FadeOutUp} style={s.pillWrap} pointerEvents="box-none">
          <Pressable
            onPress={() => atualizar('aviso')}
            style={s.pill}
            accessibilityRole="button"
            accessibilityLabel={`${qtdNovos} vídeos novos. Toque para atualizar`}>
            <Ionicons name="arrow-up" size={15} color={colors.carvao} />
            <Txt variant="label" color={colors.carvao}>
              {qtdNovos === 1 ? '1 vídeo novo' : `${qtdNovos > 20 ? '20+' : qtdNovos} vídeos novos`}
            </Txt>
          </Pressable>
        </Animated.View>
      ) : null}
    </Screen>
  );
}

function Separador() {
  return <View style={{ height: space.md }} />;
}

const s = StyleSheet.create({
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: space.sm },
  topRight: { flexDirection: 'row', alignItems: 'center', gap: space.sm, flexShrink: 1 },
  search: { backgroundColor: colors.carvao2, borderRadius: 999, padding: 8 },
  chips: { gap: space.sm, paddingRight: space.md },
  sep: { width: 1, backgroundColor: colors.carvao3, marginHorizontal: 2 },
  fim: { textAlign: 'center', marginTop: space.lg, paddingHorizontal: space.lg },
  pillWrap: { position: 'absolute', top: 152, left: 0, right: 0, alignItems: 'center', zIndex: 20 },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.pulso,
    paddingHorizontal: 16,
    paddingVertical: 9,
    borderRadius: radius.pill,
    shadowColor: '#000',
    shadowOpacity: 0.35,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
});
