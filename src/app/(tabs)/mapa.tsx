import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { FlatList, StyleSheet, View } from 'react-native';
import MapView, { Marker, type MapStyleElement } from 'react-native-maps';

import { PlaceRow } from '@/components/place-row';
import { Chip, Empty, Screen, Txt } from '@/components/ui';
import { colors, space } from '@/constants/theme';
import { useUserLocation } from '@/lib/location';
import { usePlacesNearby } from '@/lib/queries';

const darkMap: MapStyleElement[] = [
  { elementType: 'geometry', stylers: [{ color: '#17211F' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#A9B4AC' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#17211F' }] },
  { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#2C3A36' }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#0F1715' }] },
  { featureType: 'poi', stylers: [{ visibility: 'off' }] },
  { featureType: 'transit', stylers: [{ visibility: 'off' }] },
];

export default function Mapa() {
  const loc = useUserLocation();
  const places = usePlacesNearby(loc.coords);
  const [soAgora, setSoAgora] = useState(false);

  const lista = useMemo(
    () => (places.data ?? []).filter((p) => !soAgora || p.registros_agora > 0),
    [places.data, soAgora],
  );

  return (
    <Screen>
      <View style={s.mapWrap}>
        <MapView
          style={StyleSheet.absoluteFill}
          customMapStyle={darkMap}
          userInterfaceStyle="dark"
          showsUserLocation={loc.real}
          region={{
            latitude: loc.coords.lat,
            longitude: loc.coords.lng,
            latitudeDelta: 0.08,
            longitudeDelta: 0.08,
          }}>
          {lista.map((p) => (
            <Marker
              key={p.id}
              coordinate={{ latitude: p.lat, longitude: p.lng }}
              title={p.nome}
              description={p.registros_agora > 0 ? `${p.registros_agora} registros agora` : 'sem registros agora'}
              pinColor={p.registros_agora > 0 ? colors.pulso : colors.mut}
              onCalloutPress={() => router.push({ pathname: '/lugar/[id]', params: { id: p.id } })}
            />
          ))}
        </MapView>
        <View style={s.filters}>
          <Chip label="Todos" active={!soAgora} onPress={() => setSoAgora(false)} />
          <Chip label="Com registro agora" active={soAgora} onPress={() => setSoAgora(true)} />
        </View>
      </View>

      <FlatList
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: space.md, gap: space.sm }}
        data={lista}
        keyExtractor={(p) => p.id}
        renderItem={({ item }) => <PlaceRow place={item} />}
        ListHeaderComponent={
          <Txt variant="small" color={colors.mut}>
            {lista.length} lugares {loc.real ? 'perto de você' : 'em Brasília'}
          </Txt>
        }
        ListEmptyComponent={
          places.isLoading ? undefined : <Empty title="Nada por aqui" text="Nenhum lugar com registro agora nesse raio." />
        }
      />
    </Screen>
  );
}

const s = StyleSheet.create({
  mapWrap: { height: '50%', overflow: 'hidden' },
  filters: { position: 'absolute', top: space.md, left: space.md, flexDirection: 'row', gap: space.sm },
});
