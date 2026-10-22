import { useCallback, useMemo, useState } from 'react';
import { FlatList, RefreshControl, ScrollView, StyleSheet, View, type ListViewToken } from 'react-native';

import { FeedCard } from '@/components/post-card';
import { PlaceRow } from '@/components/place-row';
import { RegionChip } from '@/components/region-chip';
import { Button, Chip, Empty, Logo, Screen, Txt } from '@/components/ui';
import { categoryFilters, categoryLabel, colors, space } from '@/constants/theme';
import { track } from '@/lib/analytics';
import { useExploreFeed, usePlacesNearby } from '@/lib/queries';
import type { FeedItem, FeedMode } from '@/lib/types';

const MODOS: { key: FeedMode; label: string }[] = [
  { key: 'agora', label: 'Agora' },
  { key: 'hoje', label: 'Hoje' },
];

export default function Explorar() {
  const [mode, setMode] = useState<FeedMode>('agora');
  const [category, setCategory] = useState<string | null>(null);
  const [visivel, setVisivel] = useState<string | null>(null);
  const feed = useExploreFeed(mode, category);
  const lugares = usePlacesNearby({ category });

  const itens = useMemo(() => feed.data?.pages.flat() ?? [], [feed.data]);

  const onViewable = useCallback(({ viewableItems }: { viewableItems: ListViewToken[] }) => {
    const first = viewableItems[0]?.item as FeedItem | undefined;
    setVisivel(first?.id ?? null);
    for (const v of viewableItems) {
      const it = v.item as FeedItem;
      track('feed_item_impression', { post: it.id, place: it.place_id });
    }
  }, []);

  const vazio = !feed.isLoading && !feed.isError && itens.length === 0;

  const header = (
    <View style={{ gap: space.md, paddingBottom: space.md }}>
      <View style={s.top}>
        <Logo />
        <RegionChip />
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.chips}>
        {MODOS.map((m) => (
          <Chip key={m.key} label={m.label} active={mode === m.key} onPress={() => setMode(m.key)} />
        ))}
        <View style={s.sep} />
        {categoryFilters.map((c) => (
          <Chip
            key={c}
            tone="rosa"
            label={categoryLabel[c]}
            active={category === c}
            onPress={() => setCategory(category === c ? null : c)}
          />
        ))}
      </ScrollView>
    </View>
  );

  return (
    <Screen>
      <FlatList
        data={itens}
        keyExtractor={(i) => i.id}
        renderItem={({ item }) => <FeedCard item={item} playing={visivel === item.id} />}
        ItemSeparatorComponent={() => <View style={{ height: space.md }} />}
        contentContainerStyle={{ paddingHorizontal: space.md, paddingBottom: space.xl }}
        ListHeaderComponent={header}
        onViewableItemsChanged={onViewable}
        viewabilityConfig={{ itemVisiblePercentThreshold: 65 }}
        onEndReached={() => feed.hasNextPage && !feed.isFetchingNextPage && feed.fetchNextPage()}
        onEndReachedThreshold={0.5}
        refreshControl={
          <RefreshControl
            refreshing={feed.isRefetching && !feed.isFetchingNextPage}
            onRefresh={() => {
              feed.refetch();
              lugares.refetch();
            }}
            tintColor={colors.pulso}
          />
        }
        ListEmptyComponent={
          feed.isLoading ? (
            <Empty title="Carregando…" text="Buscando o que foi publicado por aqui." />
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
                Ainda não publicaram {mode === 'agora' ? 'agora' : 'hoje'} nessa região. Veja os lugares e o que eles
                têm programado.
              </Txt>
              {(lugares.data ?? []).slice(0, 15).map((p) => (
                <PlaceRow key={p.id} place={p} />
              ))}
            </View>
          ) : feed.isFetchingNextPage ? (
            <Txt variant="small" color={colors.mut} style={{ textAlign: 'center', marginTop: space.md }}>
              Carregando mais…
            </Txt>
          ) : undefined
        }
      />
    </Screen>
  );
}

const s = StyleSheet.create({
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: space.sm },
  chips: { gap: space.sm, paddingRight: space.md },
  sep: { width: 1, backgroundColor: colors.carvao3, marginHorizontal: 2 },
});
