import { router } from 'expo-router';
import { useState } from 'react';
import { FlatList, ScrollView, StyleSheet, View } from 'react-native';
import MapView, { Marker, type MapStyleElement } from 'react-native-maps';

import { PlaceRow } from '@/components/place-row';
import { RegionChip } from '@/components/region-chip';
import { Chip, Empty, Screen, Txt } from '@/components/ui';
import { categoryFilters, categoryLabel, colors, space } from '@/constants/theme';
import { usePlacesNearby } from '@/lib/queries';
import { useRegion } from '@/lib/region';

const darkMap: MapStyleElement[] = [
  { elementType: 'geometry', stylers: [{ color: '#17211F' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#A9B4AC' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#17211F' }] },
  { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#2C3A36' }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#0F1715' }] },
  { featureType: 'poi', stylers: [{ visibility: 'off' }] },
  { featureType: 'transit', stylers: [{ visibility: 'off' }] },
];

/** Mapa e busca por proximidade (RF-04). Nenhuma posição de outros usuários aparece. */
export default function Mapa() {
  const { coords, radius, mode } = useRegion();
  const [category, setCategory] = useState<string | null>(null);
  const places = usePlacesNearby({ category });
  const delta = Math.min(0.6, Math.max(0.03, (radius / 111000) * 2.2));

  return (
    <Screen>
      <View style={s.mapWrap}>
        <MapView
          style={StyleSheet.absoluteFill}
          customMapStyle={darkMap}
          userInterfaceStyle="dark"
          showsUserLocation={mode === 'gps'}
          region={{ latitude: coords.lat, longitude: coords.lng, latitudeDelta: delta, longitudeDelta: delta }}>
          {(places.data ?? []).map((p) => (
            <Marker
              key={p.id}
              coordinate={{ latitude: p.lat, longitude: p.lng }}
              title={p.name}
              description={p.fresh_posts > 0 ? 'Vídeo recente' : 'Sem atualização recente'}
              pinColor={p.fresh_posts > 0 ? colors.pulso : colors.mut}
              onCalloutPress={() => router.push({ pathname: '/lugar/[id]', params: { id: p.id } })}
            />
          ))}
        </MapView>
        <View style={s.overlay}>
          <RegionChip />
        </View>
      </View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={{ flexGrow: 0 }}
        contentContainerStyle={s.chips}>
        <Chip label="Todos" active={!category} onPress={() => setCategory(null)} />
        {categoryFilters.map((c) => (
          <Chip key={c} label={categoryLabel[c]} active={category === c} onPress={() => setCategory(c)} />
        ))}
      </ScrollView>
      <FlatList
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingHorizontal: space.md, paddingBottom: space.lg, gap: space.sm }}
        data={places.data ?? []}
        keyExtractor={(p) => p.id}
        renderItem={({ item }) => <PlaceRow place={item} />}
        ListEmptyComponent={
          places.isLoading ? undefined : (
            <Empty title="Nenhum lugar aqui" text="Tente outra região ou outra categoria." />
          )
        }
        ListHeaderComponent={
          <Txt variant="small" color={colors.mut}>
            {(places.data ?? []).length} lugares
          </Txt>
        }
      />
    </Screen>
  );
}

const s = StyleSheet.create({
  mapWrap: { height: '45%', overflow: 'hidden' },
  overlay: { position: 'absolute', top: space.md, left: space.md },
  chips: { gap: space.sm, padding: space.md },
});
