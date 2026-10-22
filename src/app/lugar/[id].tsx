import Ionicons from '@expo/vector-icons/Ionicons';
import * as Linking from 'expo-linking';
import { Redirect, router, useLocalSearchParams } from 'expo-router';
import { Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { Button, Empty, Screen, TimeOriginTag, Txt } from '@/components/ui';
import { colors, placeKindLabel, radius, space } from '@/constants/theme';
import { haQuanto } from '@/lib/format';
import { useAuth } from '@/lib/auth';
import { usePlace, usePlacePosts } from '@/lib/queries';
import type { PlaceDetail, PostOrigin } from '@/lib/types';

function abrirRota(p: PlaceDetail, app: 'maps' | 'waze' | 'uber') {
  const nome = encodeURIComponent(p.nome);
  const url = {
    maps:
      Platform.OS === 'ios'
        ? `https://maps.apple.com/?daddr=${p.lat},${p.lng}&q=${nome}`
        : `https://www.google.com/maps/dir/?api=1&destination=${p.lat},${p.lng}`,
    waze: `https://waze.com/ul?ll=${p.lat},${p.lng}&navigate=yes`,
    uber: `https://m.uber.com/ul/?action=setPickup&pickup=my_location&dropoff[latitude]=${p.lat}&dropoff[longitude]=${p.lng}&dropoff[nickname]=${nome}`,
  }[app];
  Linking.openURL(url);
}

function chamarGalera(p: PlaceDetail, registros: number) {
  const status = registros > 0 ? `tem ${registros} ${registros === 1 ? 'registro' : 'registros'} de agora lá` : 'bora ver como tá';
  const texto = `Bora no ${p.nome}? ${status} 👀 Vi no Cola Aqui`;
  Linking.openURL(`https://wa.me/?text=${encodeURIComponent(texto)}`);
}

type PlacePost = {
  id: string;
  created_at: string;
  origem: PostOrigin;
  legenda: string | null;
  autor: { username: string } | { username: string }[] | null;
};

const autorDe = (a: PlacePost['autor']) => (Array.isArray(a) ? a[0]?.username : a?.username) ?? '';

export default function Lugar() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { session } = useAuth();
  const place = usePlace(id);
  const posts = usePlacePosts(id);
  const p = place.data;
  const lista = (posts.data ?? []) as PlacePost[];
  if (!session) return <Redirect href="/entrar" />;

  return (
    <Screen>
      <View style={s.top}>
        <Pressable onPress={() => router.back()} hitSlop={12} accessibilityLabel="Voltar">
          <Ionicons name="chevron-back" size={28} color={colors.neblina} />
        </Pressable>
      </View>
      {!p ? (
        place.isLoading ? null : <Empty title="Lugar não encontrado" text="Ele pode ter saído do app." />
      ) : (
        <ScrollView contentContainerStyle={{ padding: space.md, gap: space.lg }}>
          <View style={{ gap: space.xs }}>
            <Txt variant="display">{p.nome}</Txt>
            <Txt color={colors.mut}>
              {placeKindLabel[p.tipo] ?? p.tipo}
              {p.bairro ? ` · ${p.bairro}` : ''}
            </Txt>
            {p.endereco ? <Txt variant="small" color={colors.mut}>{p.endereco}</Txt> : null}
            {p.fundador ? (
              <View style={s.selo}>
                <Txt variant="caption" color={colors.carvao}>
                  PARCEIRO FUNDADOR
                </Txt>
              </View>
            ) : null}
          </View>

          <View style={{ gap: space.sm }}>
            <Button
              title="Chamar a galera"
              kind="rosa"
              icon={<Ionicons name="logo-whatsapp" size={18} color={colors.neblina} />}
              onPress={() => chamarGalera(p, lista.length)}
            />
            <View style={{ flexDirection: 'row', gap: space.sm }}>
              <Button title="Rota" kind="secondary" style={{ flex: 1 }} onPress={() => abrirRota(p, 'maps')} />
              <Button title="Waze" kind="secondary" style={{ flex: 1 }} onPress={() => abrirRota(p, 'waze')} />
              <Button title="Uber" kind="secondary" style={{ flex: 1 }} onPress={() => abrirRota(p, 'uber')} />
            </View>
          </View>

          <View style={{ gap: space.sm }}>
            <Txt variant="label">Registros das últimas 4 horas</Txt>
            {lista.length === 0 ? (
              <Txt color={colors.mut}>Ninguém postou daqui nas últimas 4 horas.</Txt>
            ) : (
              lista.map((post) => (
                <View key={post.id} style={s.post}>
                  <TimeOriginTag ha={haQuanto(post.created_at)} origem={post.origem} />
                  {post.legenda ? <Txt>{post.legenda}</Txt> : null}
                  <Txt variant="small" color={colors.mut}>
                    @{autorDe(post.autor)}
                  </Txt>
                </View>
              ))
            )}
          </View>
        </ScrollView>
      )}
    </Screen>
  );
}

const s = StyleSheet.create({
  top: { paddingHorizontal: space.sm, paddingVertical: space.xs },
  selo: {
    alignSelf: 'flex-start',
    backgroundColor: colors.pulso,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radius.pill,
    marginTop: space.sm,
  },
  post: { gap: 6, padding: space.md, backgroundColor: colors.carvao2, borderRadius: radius.md },
});
