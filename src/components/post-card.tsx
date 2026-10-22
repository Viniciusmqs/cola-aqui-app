import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { categoryLabel, colors, radius, space } from '@/constants/theme';
import { denunciaChoices, denunciar } from '@/lib/actions';
import { track } from '@/lib/analytics';
import { useRequireAuth } from '@/lib/auth';
import { distancia } from '@/lib/format';
import type { FeedItem, PlacePost } from '@/lib/types';

import { ChoiceSheet } from './choice-sheet';
import { PublishedTag, Txt } from './ui';

/** Player do PRD (RF-06): carrega progressivo, mudo no feed, estado recuperável se a mídia falhar. */
export function PostVideo({
  uri,
  playing,
  postId,
  placeId,
}: {
  uri: string;
  playing: boolean;
  postId: string;
  placeId?: string;
}) {
  const [falhou, setFalhou] = useState(false);
  const contou = useRef(false);
  const player = useVideoPlayer(uri, (p) => {
    p.loop = true;
    p.muted = true;
  });

  useEffect(() => {
    const sub = player.addListener('statusChange', ({ status }) => setFalhou(status === 'error'));
    return () => sub.remove();
  }, [player]);

  useEffect(() => {
    if (playing) {
      player.play();
      if (!contou.current) {
        contou.current = true;
        track('post_play', { post: postId, place: placeId });
      }
    } else player.pause();
  }, [playing, player, postId, placeId]);

  if (falhou) {
    return (
      <View style={[StyleSheet.absoluteFill, s.fallback]}>
        <Ionicons name="cloud-offline-outline" size={28} color={colors.mut} />
        <Txt variant="small" color={colors.mut}>
          Não deu para carregar o vídeo
        </Txt>
        <Pressable onPress={() => player.replace(uri)} style={s.retry} accessibilityRole="button">
          <Txt variant="label" color={colors.carvao}>
            Tentar de novo
          </Txt>
        </Pressable>
      </View>
    );
  }
  return <VideoView player={player} style={StyleSheet.absoluteFill} contentFit="cover" nativeControls={false} />;
}

/** Cartão do feed Explorar (RF-03): lugar, bairro, origem, horário e categoria sempre visíveis. */
export function FeedCard({ item, playing }: { item: FeedItem; playing: boolean }) {
  const [menu, setMenu] = useState(false);
  const requireAuth = useRequireAuth();
  const abrirLugar = () => router.push({ pathname: '/lugar/[id]', params: { id: item.place_id } });

  return (
    <View style={s.card}>
      <View style={s.media}>
        {item.media_url ? (
          <PostVideo uri={item.media_url} playing={playing} postId={item.id} placeId={item.place_id} />
        ) : (
          <View style={[StyleSheet.absoluteFill, s.fallback]} />
        )}
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={abrirLugar}
          accessibilityLabel={`Abrir ${item.place_name}`}
        />
        <View style={s.top} pointerEvents="box-none">
          <View style={{ flex: 1 }}>
            <PublishedTag
              publishedAt={item.published_at}
              origin={item.origin}
              sponsored={item.sponsored}
              fresh={item.is_fresh}
            />
          </View>
          <Pressable onPress={() => setMenu(true)} hitSlop={12} style={s.more} accessibilityLabel="Mais opções">
            <Ionicons name="ellipsis-horizontal" size={18} color={colors.neblina} />
          </Pressable>
        </View>
      </View>
      <Pressable onPress={abrirLugar} style={s.info} accessibilityRole="link">
        <Txt variant="title" numberOfLines={1}>
          {item.place_name}
        </Txt>
        <Txt variant="small" color={colors.mut}>
          {categoryLabel[item.place_category] ?? item.place_category}
          {item.place_neighborhood ? ` · ${item.place_neighborhood}` : ''} · {distancia(item.distance_m)}
        </Txt>
        {item.caption ? <Txt style={{ marginTop: 6 }}>{item.caption}</Txt> : null}
        <Txt variant="small" color={colors.mut} style={{ marginTop: 4 }}>
          @{item.author_username}
        </Txt>
      </Pressable>
      <ChoiceSheet
        visible={menu}
        title="Denunciar esta publicação"
        subtitle="Sua denúncia é anônima para quem publicou."
        choices={denunciaChoices}
        onClose={() => setMenu(false)}
        onSelect={(reason) => {
          if (requireAuth('denunciar')) denunciar({ post: item.id }, reason);
        }}
      />
    </View>
  );
}

/** Publicação dentro da página do lugar. */
export function PlacePostCard({ post, placeId, playing }: { post: PlacePost; placeId: string; playing: boolean }) {
  const [menu, setMenu] = useState(false);
  const requireAuth = useRequireAuth();
  return (
    <View style={s.small}>
      {post.media_url ? <PostVideo uri={post.media_url} playing={playing} postId={post.id} placeId={placeId} /> : null}
      <View style={s.top}>
        <View style={{ flex: 1 }}>
          <PublishedTag
            publishedAt={post.published_at}
            origin={post.origin}
            sponsored={post.sponsored}
            fresh={post.is_fresh}
          />
        </View>
        <Pressable onPress={() => setMenu(true)} hitSlop={12} style={s.more} accessibilityLabel="Mais opções">
          <Ionicons name="ellipsis-horizontal" size={18} color={colors.neblina} />
        </Pressable>
      </View>
      <View style={s.smallBottom}>
        {post.caption ? <Txt>{post.caption}</Txt> : null}
        <Txt variant="small" color={colors.neblina}>
          @{post.author_username}
        </Txt>
      </View>
      <ChoiceSheet
        visible={menu}
        title="Denunciar esta publicação"
        subtitle="Sua denúncia é anônima para quem publicou."
        choices={denunciaChoices}
        onClose={() => setMenu(false)}
        onSelect={(reason) => {
          if (requireAuth('denunciar')) denunciar({ post: post.id }, reason);
        }}
      />
    </View>
  );
}

const s = StyleSheet.create({
  card: { backgroundColor: colors.carvao2, borderRadius: radius.lg, overflow: 'hidden' },
  media: { aspectRatio: 4 / 5, backgroundColor: '#0E1513', overflow: 'hidden', position: 'relative' },
  top: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    padding: space.md,
    gap: space.sm,
  },
  more: { backgroundColor: 'rgba(23,33,31,0.78)', borderRadius: radius.pill, padding: 6 },
  info: { padding: space.md, gap: 2, backgroundColor: colors.carvao2 },
  fallback: { alignItems: 'center', justifyContent: 'center', gap: space.sm, backgroundColor: '#0E1513' },
  retry: { backgroundColor: colors.pulso, paddingHorizontal: 14, paddingVertical: 8, borderRadius: radius.pill },
  small: {
    position: 'relative',
    width: 220,
    aspectRatio: 9 / 16,
    borderRadius: radius.md,
    overflow: 'hidden',
    backgroundColor: '#0E1513',
    justifyContent: 'space-between',
  },
  smallBottom: { padding: space.sm, gap: 2, backgroundColor: 'rgba(23,33,31,0.6)' },
});
