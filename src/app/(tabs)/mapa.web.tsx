import { useMemo, useState } from 'react';
import { FlatList, View } from 'react-native';

import { PlaceRow } from '@/components/place-row';
import { Chip, Empty, Screen, Txt } from '@/components/ui';
import { colors, space } from '@/constants/theme';
import { useUserLocation } from '@/lib/location';
import { usePlacesNearby } from '@/lib/queries';

/** Na web (pré-visualização) não há mapa nativo: mostramos a lista de lugares. */
export default function MapaWeb() {
  const loc = useUserLocation();
  const places = usePlacesNearby(loc.coords);
  const [soAgora, setSoAgora] = useState(false);
  const lista = useMemo(
    () => (places.data ?? []).filter((p) => !soAgora || p.registros_agora > 0),
    [places.data, soAgora],
  );

  return (
    <Screen>
      <FlatList
        contentContainerStyle={{ padding: space.md, gap: space.sm }}
        data={lista}
        keyExtractor={(p) => p.id}
        renderItem={({ item }) => <PlaceRow place={item} />}
        ListHeaderComponent={
          <View style={{ gap: space.md, marginBottom: space.sm }}>
            <Txt variant="title">Mapa</Txt>
            <Txt variant="small" color={colors.mut}>
              O mapa aparece no app do celular. Aqui vai a lista de lugares.
            </Txt>
            <View style={{ flexDirection: 'row', gap: space.sm }}>
              <Chip label="Todos" active={!soAgora} onPress={() => setSoAgora(false)} />
              <Chip label="Com registro agora" active={soAgora} onPress={() => setSoAgora(true)} />
            </View>
          </View>
        }
        ListEmptyComponent={
          places.isLoading ? undefined : <Empty title="Nada por aqui" text="Nenhum lugar com registro agora nesse raio." />
        }
      />
    </Screen>
  );
}
