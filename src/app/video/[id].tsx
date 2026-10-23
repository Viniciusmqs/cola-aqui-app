import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BrandSpinner } from '@/components/brand';
import { ChoiceSheet } from '@/components/choice-sheet';
import { PostVideo } from '@/components/post-card';
import { Button, PublishedTag, Txt } from '@/components/ui';
import { categoryLabel, colors, radius, space } from '@/constants/theme';
import { abrirRota, compartilharLugar, denunciaChoices, denunciar, rotaChoices } from '@/lib/actions';
import { useRequireAuth } from '@/lib/auth';
import { usePost } from '@/lib/queries';
import { useSound } from '@/lib/sound';

/**
 * Vídeo em tela cheia (RF-06): toca com o som que a pessoa escolheu, mostra sempre
 * o rótulo de publicação e leva direto para "Como chegar" e para o perfil do lugar.
 */
export default function VideoTelaCheia() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const post = usePost(id);
  const { muted, toggle } = useSound();
  const requireAuth = useRequireAuth();
  const [pausado, setPausado] = useState(false);
  const [rota, setRota] = useState(false);
  const [menu, setMenu] = useState(false);

  const fechar = () => (router.canGoBack() ? router.back() : router.replace('/'));
  const p = post.data;

  return (
    <View style={s.root}>
      {p?.media_url ? (
        <PostVideo
          uri={p.media_url}
          thumb={p.thumb_url}
          playing={!pausado}
          muted={muted}
          postId={p.id}
          placeId={p.place_id}
          contentFit="cover"
        />
      ) : null}
      <Pressable
        style={StyleSheet.absoluteFill}
        onPress={() => setPausado((v) => !v)}
        accessibilityRole="button"
        accessibilityLabel={pausado ? 'Continuar vídeo' : 'Pausar vídeo'}
      />
      {pausado ? (
        <View style={s.center} pointerEvents="none">
          <View style={s.play}>
            <Ionicons name="play" size={34} color={colors.carvao} />
          </View>
        </View>
      ) : null}

      <SafeAreaView style={s.overlay} pointerEvents="box-none">
        <View style={s.top} pointerEvents="box-none">
          <Pressable onPress={fechar} hitSlop={12} style={s.round} accessibilityLabel="Fechar vídeo">
            <Ionicons name="close" size={22} color={colors.neblina} />
          </Pressable>
          <View style={{ flexDirection: 'row', gap: space.sm }}>
            <Pressable
              onPress={toggle}
              hitSlop={12}
              style={s.round}
              accessibilityLabel={muted ? 'Ligar som' : 'Desligar som'}>
              <Ionicons name={muted ? 'volume-mute' : 'volume-high'} size={20} color={colors.neblina} />
            </Pressable>
            {p ? (
              <Pressable onPress={() => setMenu(true)} hitSlop={12} style={s.round} accessibilityLabel="Denunciar">
                <Ionicons name="flag-outline" size={20} color={colors.neblina} />
              </Pressable>
            ) : null}
          </View>
        </View>

        {post.isLoading ? (
          <View style={s.center}>
            <BrandSpinner size={48} />
          </View>
        ) : !p ? (
          <View style={[s.center, { gap: space.md, padding: space.lg }]}>
            <Txt variant="title" style={{ textAlign: 'center' }}>
              Este vídeo não está mais disponível
            </Txt>
            <Txt color={colors.mut} style={{ textAlign: 'center' }}>
              Ele pode ter saído do ar depois de uma denúncia ou a pessoa apagou.
            </Txt>
            <Button title="Voltar" kind="secondary" onPress={fechar} />
          </View>
        ) : (
          <View style={s.bottom} pointerEvents="box-none">
            <PublishedTag
              publishedAt={p.sent_at ?? p.published_at}
              origin={p.origin}
              sponsored={p.sponsored}
              freshUntil={p.fresh_until}
            />
            <Pressable
              onPress={() => router.push({ pathname: '/lugar/[id]', params: { id: p.place_id } })}
              accessibilityRole="link"
              style={{ gap: 2 }}>
              <View style={s.nameRow}>
                <Txt variant="display" numberOfLines={2} style={{ flexShrink: 1 }}>
                  {p.place_name}
                </Txt>
                <Ionicons name="chevron-forward" size={22} color={colors.neblina} />
              </View>
              <Txt variant="small" color={colors.neblina}>
                {categoryLabel[p.place_category] ?? p.place_category}
                {p.place_neighborhood ? ` · ${p.place_neighborhood}` : ''}
              </Txt>
            </Pressable>
            {p.caption ? <Txt>{p.caption}</Txt> : null}
            <Txt variant="small" color={colors.mut}>
              @{p.author_username}
            </Txt>
            <View style={s.actions}>
              <Button
                title="Como chegar"
                style={{ flex: 1 }}
                icon={<Ionicons name="navigate" size={18} color={colors.carvao} />}
                onPress={() => setRota(true)}
              />
              <Pressable
                onPress={() =>
                  compartilharLugar({
                    id: p.place_id,
                    name: p.place_name,
                    lat: p.lat,
                    lng: p.lng,
                    address: p.place_address,
                  })
                }
                style={s.share}
                accessibilityRole="button"
                accessibilityLabel="Compartilhar lugar">
                <Ionicons name="share-social-outline" size={22} color={colors.neblina} />
              </Pressable>
            </View>
          </View>
        )}
      </SafeAreaView>

      {p ? (
        <>
          <ChoiceSheet
            visible={rota}
            title={`Como chegar em ${p.place_name}`}
            choices={rotaChoices}
            onClose={() => setRota(false)}
            onSelect={(app) =>
              abrirRota({ id: p.place_id, name: p.place_name, lat: p.lat, lng: p.lng, address: p.place_address }, app)
            }
          />
          <ChoiceSheet
            visible={menu}
            title="Denunciar esta publicação"
            subtitle="Sua denúncia é anônima para quem publicou."
            choices={denunciaChoices}
            onClose={() => setMenu(false)}
            onSelect={(reason) => requireAuth('denunciar') && denunciar({ post: p.id }, reason)}
          />
        </>
      ) : null}
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0B100F' },
  overlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, justifyContent: 'space-between' },
  top: { flexDirection: 'row', justifyContent: 'space-between', padding: space.md },
  round: { backgroundColor: 'rgba(23,33,31,0.7)', borderRadius: radius.pill, padding: 9 },
  center: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  play: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: colors.pulso,
    alignItems: 'center',
    justifyContent: 'center',
    paddingLeft: 4,
  },
  bottom: {
    gap: space.sm,
    padding: space.md,
    paddingBottom: space.lg,
    backgroundColor: 'rgba(11,16,15,0.55)',
  },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  actions: { flexDirection: 'row', gap: space.sm, marginTop: space.sm, alignItems: 'center' },
  share: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: colors.carvao2,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
