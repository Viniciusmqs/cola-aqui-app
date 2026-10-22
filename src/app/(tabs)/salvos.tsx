import Ionicons from '@expo/vector-icons/Ionicons';
import { Link, router } from 'expo-router';
import { FlatList, Pressable, StyleSheet, View } from 'react-native';

import { Button, Empty, LoginGate, Screen, Txt } from '@/components/ui';
import { categoryLabel, colors, radius, space } from '@/constants/theme';
import { useAuth } from '@/lib/auth';
import { useSaved, useToggleSave } from '@/lib/queries';

type SavedRow = {
  place_id: string;
  place: { id: string; name: string; category: string; neighborhood: string | null } | null;
};

/** Salvos (RF-09). Na primeira versão ocupa o lugar de uma aba social (decisão de UX do PRD). */
export default function Salvos() {
  const { session } = useAuth();
  const saved = useSaved();
  const toggle = useToggleSave();

  if (!session) {
    return (
      <LoginGate
        title="Seus lugares salvos"
        text="Entre na sua conta para guardar os lugares que você quer conhecer."
      />
    );
  }

  const rows = (saved.data ?? []) as unknown as SavedRow[];

  return (
    <Screen>
      <FlatList
        contentContainerStyle={{ padding: space.md, gap: space.sm, flexGrow: 1 }}
        data={rows.filter((r) => r.place)}
        keyExtractor={(r) => r.place_id}
        ListHeaderComponent={
          <Txt variant="title" style={{ marginBottom: space.sm }}>
            Salvos
          </Txt>
        }
        renderItem={({ item }) => (
          <View style={s.row}>
            <Link href={{ pathname: '/lugar/[id]', params: { id: item.place_id } }} asChild>
              <Pressable style={{ flex: 1 }} accessibilityRole="link">
                <Txt variant="label">{item.place!.name}</Txt>
                <Txt variant="small" color={colors.mut}>
                  {categoryLabel[item.place!.category] ?? item.place!.category}
                  {item.place!.neighborhood ? ` · ${item.place!.neighborhood}` : ''}
                </Txt>
              </Pressable>
            </Link>
            <Pressable
              onPress={() => toggle.mutate({ placeId: item.place_id, saved: true })}
              hitSlop={12}
              accessibilityLabel={`Remover ${item.place!.name} dos salvos`}>
              <Ionicons name="bookmark" size={22} color={colors.pulso} />
            </Pressable>
          </View>
        )}
        ListEmptyComponent={
          saved.isLoading ? undefined : (
            <Empty
              title="Nada salvo ainda"
              text="Toque em Salvar na página de um lugar para guardar aqui."
              action={<Button title="Explorar lugares" kind="secondary" onPress={() => router.navigate('/')} />}
            />
          )
        }
      />
    </Screen>
  );
}

const s = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    padding: space.md,
    backgroundColor: colors.carvao2,
    borderRadius: radius.md,
  },
});
