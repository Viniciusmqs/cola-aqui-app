import { useState } from 'react';
import { FlatList, ScrollView, StyleSheet, View } from 'react-native';

import { PlaceRow } from '@/components/place-row';
import { RegionChip } from '@/components/region-chip';
import { Chip, Empty, Screen, Txt } from '@/components/ui';
import { categoryFilters, categoryLabel, colors, space } from '@/constants/theme';
import { usePlacesNearby } from '@/lib/queries';

/** Na pré-visualização web não há mapa nativo: mostramos a lista de lugares. */
export default function MapaWeb() {
  const [category, setCategory] = useState<string | null>(null);
  const places = usePlacesNearby({ category });

  return (
    <Screen>
      <FlatList
        contentContainerStyle={{ padding: space.md, gap: space.sm }}
        data={places.data ?? []}
        keyExtractor={(p) => p.id}
        renderItem={({ item }) => <PlaceRow place={item} />}
        ListHeaderComponent={
          <View style={{ gap: space.md, marginBottom: space.sm }}>
            <View style={s.top}>
              <Txt variant="title">Mapa</Txt>
              <RegionChip />
            </View>
            <Txt variant="small" color={colors.mut}>
              O mapa aparece no app do celular. Aqui vai a lista de lugares.
            </Txt>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space.sm }}>
              <Chip label="Todos" active={!category} onPress={() => setCategory(null)} />
              {categoryFilters.map((c) => (
                <Chip key={c} label={categoryLabel[c]} active={category === c} onPress={() => setCategory(c)} />
              ))}
            </ScrollView>
          </View>
        }
        ListEmptyComponent={
          places.isLoading ? undefined : (
            <Empty title="Nenhum lugar aqui" text="Tente outra região ou outra categoria." />
          )
        }
      />
    </Screen>
  );
}

const s = StyleSheet.create({
  top: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
});
