import { router } from 'expo-router';
import { useCallback, useState } from 'react';
import { FlatList, RefreshControl, StyleSheet, View, type ListViewToken } from 'react-native';

import { PostCard } from '@/components/post-card';
import { Button, Empty, Logo, Screen, Txt } from '@/components/ui';
import { colors, space } from '@/constants/theme';
import { useUserLocation } from '@/lib/location';
import { useFeed } from '@/lib/queries';
import type { FeedItem } from '@/lib/types';

const GAP = space.sm;

export default function Agora() {
  const loc = useUserLocation();
  const feed = useFeed(loc.coords);
  const [h, setH] = useState(0);
  const [visivel, setVisivel] = useState<string | null>(null);

  const onViewable = useCallback(({ viewableItems }: { viewableItems: ListViewToken[] }) => {
    setVisivel((viewableItems[0]?.item as FeedItem | undefined)?.id ?? null);
  }, []);

  const refresh = useCallback(async () => {
    await loc.refresh();
    await feed.refetch();
  }, [loc, feed]);

  const itemH = Math.max(h - GAP, 0);

  return (
    <Screen>
      <View style={s.header}>
        <Logo />
        <Txt variant="small" color={colors.mut}>
          {loc.real ? 'perto de você' : 'Brasília'}
        </Txt>
      </View>

      {loc.status === 'negado' ? (
        <View style={s.banner}>
          <Txt variant="small" color={colors.carvao}>
            Libere a localização para ver o que tá rolando perto de você.
          </Txt>
        </View>
      ) : null}

      <View style={{ flex: 1, paddingHorizontal: space.sm }} onLayout={(e) => setH(e.nativeEvent.layout.height)}>
        {h > 0 ? (
          <FlatList
            data={feed.data ?? []}
            keyExtractor={(i) => i.id}
            renderItem={({ item }) => (
              <View style={{ height: h }}>
                <PostCard item={item} height={itemH} playing={visivel === item.id} />
              </View>
            )}
            pagingEnabled
            snapToInterval={h}
            decelerationRate="fast"
            showsVerticalScrollIndicator={false}
            onViewableItemsChanged={onViewable}
            viewabilityConfig={{ itemVisiblePercentThreshold: 60 }}
            getItemLayout={(_, index) => ({ length: h, offset: h * index, index })}
            refreshControl={
              <RefreshControl refreshing={feed.isRefetching} onRefresh={refresh} tintColor={colors.pulso} />
            }
            ListEmptyComponent={
              feed.isLoading ? (
                <Empty title="Procurando o rolê…" text="Carregando o que foi postado nas últimas horas." />
              ) : feed.isError ? (
                <Empty
                  title="Não deu para carregar"
                  text="Confere sua conexão e puxa para atualizar."
                  action={<Button title="Tentar de novo" kind="secondary" onPress={() => feed.refetch()} />}
                />
              ) : (
                <Empty
                  title="Ainda tá quieto por aqui"
                  text="Ninguém postou perto de você nas últimas 4 horas. Seja o primeiro a mostrar como tá o rolê."
                  action={<Button title="Postar um registro" onPress={() => router.navigate('/postar')} />}
                />
              )
            }
          />
        ) : null}
      </View>
    </Screen>
  );
}

const s = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
  },
  banner: {
    backgroundColor: colors.pulso,
    marginHorizontal: space.md,
    marginBottom: space.sm,
    padding: space.sm,
    borderRadius: 10,
  },
});
