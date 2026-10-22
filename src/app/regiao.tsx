import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useState } from 'react';
import { FlatList, Pressable, StyleSheet, View } from 'react-native';

import { Screen, Txt } from '@/components/ui';
import { colors, radius, space } from '@/constants/theme';
import { useRegion } from '@/lib/region';

/** Seleção de cidade/região (RF-01, QA-02): GPS é opcional. */
export default function Regiao() {
  const { regions, regionSlug, mode, gps, ativarGps, chooseRegion } = useRegion();
  const [aviso, setAviso] = useState<string | null>(null);
  const fechar = () => (router.canGoBack() ? router.back() : router.replace('/'));

  return (
    <Screen edges={['top', 'bottom']}>
      <FlatList
        contentContainerStyle={{ padding: space.md, gap: space.sm }}
        data={regions}
        keyExtractor={(r) => r.slug}
        ListHeaderComponent={
          <View style={{ gap: space.md, marginBottom: space.sm }}>
            <View style={s.top}>
              <Txt variant="title">Onde você quer explorar?</Txt>
              <Pressable onPress={fechar} hitSlop={12} accessibilityLabel="Fechar">
                <Ionicons name="close" size={28} color={colors.neblina} />
              </Pressable>
            </View>
            <Pressable
              style={[s.item, mode === 'gps' && s.active]}
              accessibilityRole="button"
              onPress={async () => {
                setAviso(null);
                const ok = await ativarGps();
                if (ok) fechar();
                else
                  setAviso(
                    'Sem acesso à localização. Escolha uma região abaixo; dá para liberar depois nos ajustes do celular.',
                  );
              }}>
              <Ionicons name="navigate" size={20} color={colors.pulso} />
              <View style={{ flex: 1 }}>
                <Txt variant="label">Perto de mim</Txt>
                <Txt variant="small" color={colors.mut}>
                  {gps === 'pedindo' ? 'Pegando sua localização…' : 'Usa a localização do celular só para buscar perto'}
                </Txt>
              </View>
            </Pressable>
            {aviso ? (
              <Txt variant="small" color={colors.algodao}>
                {aviso}
              </Txt>
            ) : null}
            <Txt variant="small" color={colors.mut} style={{ marginTop: space.sm }}>
              Ou escolha uma região
            </Txt>
          </View>
        }
        renderItem={({ item }) => {
          const ativo = mode === 'region' && regionSlug === item.slug;
          return (
            <Pressable
              style={[s.item, ativo && s.active]}
              accessibilityRole="button"
              accessibilityState={{ selected: ativo }}
              onPress={() => {
                chooseRegion(item);
                fechar();
              }}>
              <Ionicons name="location-outline" size={20} color={ativo ? colors.pulso : colors.mut} />
              <Txt variant="label" style={{ flex: 1 }}>
                {item.name}
              </Txt>
              {ativo ? <Ionicons name="checkmark" size={20} color={colors.pulso} /> : null}
            </Pressable>
          );
        }}
      />
    </Screen>
  );
}

const s = StyleSheet.create({
  top: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    padding: space.md,
    backgroundColor: colors.carvao2,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  active: { borderColor: colors.pulso },
});
