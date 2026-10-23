import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { FlatList, Pressable, StyleSheet, TextInput, View } from 'react-native';

import { PlaceRow } from '@/components/place-row';
import { RowSkeleton } from '@/components/skeleton';
import { Empty, Screen, Txt } from '@/components/ui';
import { colors, fonts, radius, space } from '@/constants/theme';
import { usePlacesNearby } from '@/lib/queries';

/** Buscar lugar pelo nome ou bairro, em toda Brasília (RF-04). */
export default function Buscar() {
  const [texto, setTexto] = useState('');
  const [termo, setTermo] = useState('');

  // espera a pessoa parar de digitar (menos consultas, resposta mais estável)
  useEffect(() => {
    const t = setTimeout(() => setTermo(texto.trim()), 300);
    return () => clearTimeout(t);
  }, [texto]);

  const busca = usePlacesNearby({ search: termo, radius: 60000 });
  const lista = busca.data ?? [];

  return (
    <Screen>
      <View style={s.bar}>
        <Pressable
          onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}
          hitSlop={12}
          accessibilityLabel="Voltar">
          <Ionicons name="chevron-back" size={28} color={colors.neblina} />
        </Pressable>
        <View style={s.inputWrap}>
          <Ionicons name="search" size={18} color={colors.mut} />
          <TextInput
            value={texto}
            onChangeText={setTexto}
            autoFocus
            placeholder="Bar, show, feira, bairro…"
            placeholderTextColor={colors.mut}
            selectionColor={colors.pulso}
            returnKeyType="search"
            autoCorrect={false}
            style={s.input}
            accessibilityLabel="Buscar lugar"
          />
          {texto ? (
            <Pressable onPress={() => setTexto('')} hitSlop={10} accessibilityLabel="Limpar busca">
              <Ionicons name="close-circle" size={18} color={colors.mut} />
            </Pressable>
          ) : null}
        </View>
      </View>
      <FlatList
        data={lista}
        keyExtractor={(p) => p.id}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        contentContainerStyle={{ paddingHorizontal: space.md, paddingBottom: space.xl }}
        ListHeaderComponent={
          lista.length > 0 ? (
            <Txt variant="small" color={colors.mut} style={{ marginVertical: space.sm }}>
              {termo ? `${lista.length} lugar${lista.length > 1 ? 'es' : ''} para “${termo}”` : 'Lugares perto de você'}
            </Txt>
          ) : undefined
        }
        renderItem={({ item }) => <PlaceRow place={item} />}
        ListEmptyComponent={
          busca.isLoading ? (
            <View style={{ gap: space.sm, marginTop: space.md }}>
              <RowSkeleton />
              <RowSkeleton />
              <RowSkeleton />
            </View>
          ) : busca.isError ? (
            <Empty title="Não deu para buscar" text="Confere sua conexão e tenta de novo." />
          ) : (
            <Empty
              title="Nada encontrado"
              text={`Ainda não temos “${termo}” no catálogo. Tente outro nome ou o bairro.`}
            />
          )
        }
      />
    </Screen>
  );
}

const s = StyleSheet.create({
  bar: { flexDirection: 'row', alignItems: 'center', gap: space.sm, padding: space.sm },
  inputWrap: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    backgroundColor: colors.carvao2,
    borderRadius: radius.pill,
    paddingHorizontal: space.md,
    minHeight: 46,
  },
  input: { flex: 1, color: colors.neblina, fontFamily: fonts.regular, fontSize: 16, paddingVertical: 10 },
});
