import Ionicons from '@expo/vector-icons/Ionicons';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { useVideoPlayer, VideoView, type VideoPlayer } from 'expo-video';
import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { categoryLabel, colors, radius, space } from '@/constants/theme';
import { denunciaChoices, denunciar } from '@/lib/actions';
import { track } from '@/lib/analytics';
import { useRequireAuth } from '@/lib/auth';
import { distancia } from '@/lib/format';
import { markSeen } from '@/lib/seen';
import { useSound } from '@/lib/sound';
import type { FeedItem, PlacePost } from '@/lib/types';

import { BrandSpinner } from './brand';
import { ChoiceSheet } from './choice-sheet';
import { PublishedTag, Txt } from './ui';

function aplicarSom(p: VideoPlayer, muted: boolean) {
  p.muted = muted;
}

/**
 * Player (RF-06): mostra a miniatura enquanto carrega, toca só o vídeo visível,
 * começa mudo no feed e tem estado de erro com "tentar de novo".
 */
export function PostVideo({
  uri,
  thumb,
  playing,
  postId,
  placeId,
  muted = true,
  contentFit = 'cover',
}: {
  uri: string;
  thumb?: string | null;
  playing: boolean;
  postId: string;
  placeId?: string;
  muted?: boolean;
  contentFit?: 'cover' | 'contain';
}) {
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const contou = useRef(false);
  const completou = useRef(false);
  const player = useVideoPlayer(uri, (p) => {
    p.loop = true;
    p.muted = true;
    p.timeUpdateEventInterval = 0.5;
  });

  // "assistiu até o fim" (sinal de qualidade para a ordem do feed): 90 % do vídeo, uma vez
  useEffect(() => {
    const sub = player.addListener('timeUpdate', ({ currentTime }) => {
      const d = player.duration;
      if (!completou.current && d > 0 && currentTime >= d * 0.9) {
        completou.current = true;
        track('post_complete', { post: postId, place: placeId });
      }
    });
    return () => sub.remove();
  }, [player, postId, placeId]);

  useEffect(() => {
    const sub = player.addListener('statusChange', ({ status: st }) => {
      if (st === 'error') setStatus('error');
      else if (st === 'readyToPlay') setStatus('ready');
    });
    return () => sub.remove();
  }, [player]);

  useEffect(() => {
    aplicarSom(player, muted);
  }, [muted, player]);

  useEffect(() => {
    if (playing) {
      player.play();
      if (!contou.current) {
        contou.current = true;
        track('post_play', { post: postId, place: placeId });
      }
    } else player.pause();
  }, [playing, player, postId, placeId]);

  if (status === 'error') {
    return (
      <View style={[StyleSheet.absoluteFill, s.fallback]}>
        <Ionicons name="cloud-offline-outline" size={28} color={colors.mut} />
        <Txt variant="small" color={colors.mut}>
          Não deu para carregar o vídeo
        </Txt>
        <Pressable
          onPress={() => {
            setStatus('loading');
            player.replace(uri);
          }}
          style={s.retry}
          accessibilityRole="button">
          <Txt variant="label" color={colors.carvao}>
            Tentar de novo
          </Txt>
        </Pressable>
      </View>
    );
  }
  return (
    <>
      <VideoView player={player} style={StyleSheet.absoluteFill} contentFit={contentFit} nativeControls={false} />
      {status !== 'ready' ? (
        <View style={StyleSheet.absoluteFill} pointerEvents="none">
          {thumb ? (
            <Image source={{ uri: thumb }} style={StyleSheet.absoluteFill} contentFit={contentFit} transition={150} />
          ) : null}
          {playing ? (
            <View style={s.loading}>
              <BrandSpinner size={34} />
            </View>
          ) : null}
        </View>
      ) : null}
    </>
  );
}

function SoundButton() {
  const { muted, toggle } = useSound();
  return (
    <Pressable
      onPress={toggle}
      hitSlop={12}
      style={s.round}
      accessibilityRole="button"
      accessibilityLabel={muted ? 'Ligar som' : 'Desligar som'}>
      <Ionicons name={muted ? 'volume-mute' : 'volume-high'} size={18} color={colors.neblina} />
    </Pressable>
  );
}

/** Cartão do feed Explorar (RF-03): lugar, bairro, origem, horário e categoria sempre visíveis. */
export function FeedCard({ item, playing, near = true }: { item: FeedItem; playing: boolean; near?: boolean }) {
  const [menu, setMenu] = useState(false);

  // conta como visto depois de 2 s tocando (o servidor rebaixa o que a pessoa já viu)
  useEffect(() => {
    if (!playing) return;
    const t = setTimeout(() => markSeen(item.id), 2000);
    return () => clearTimeout(t);
  }, [playing, item.id]);

  const requireAuth = useRequireAuth();
  const { muted } = useSound();
  const abrirLugar = () => router.push({ pathname: '/lugar/[id]', params: { id: item.place_id } });
  const abrirVideo = () => router.push({ pathname: '/video/[id]', params: { id: item.id } });

  return (
    <View style={s.card}>
      <View style={s.media}>
        {item.media_url && near ? (
          <PostVideo
            uri={item.media_url}
            thumb={item.thumb_url}
            playing={playing}
            muted={muted}
            postId={item.id}
            placeId={item.place_id}
          />
        ) : item.thumb_url ? (
          // longe da tela: só a capa (no máximo 3 players vivos, rolagem leve e sem estourar memória)
          <Image source={{ uri: item.thumb_url }} style={StyleSheet.absoluteFill} contentFit="cover" />
        ) : (
          <View style={[StyleSheet.absoluteFill, s.fallback]} />
        )}
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={abrirVideo}
          accessibilityRole="button"
          accessibilityLabel={`Assistir vídeo de ${item.place_name} em tela cheia`}
        />
        <View style={s.top} pointerEvents="box-none">
          <View style={{ flex: 1 }}>
            <PublishedTag
              publishedAt={item.sent_at ?? item.published_at}
              origin={item.origin}
              sponsored={item.sponsored}
              freshUntil={item.fresh_until}
            />
          </View>
          <Pressable onPress={() => setMenu(true)} hitSlop={12} style={s.round} accessibilityLabel="Mais opções">
            <Ionicons name="ellipsis-horizontal" size={18} color={colors.neblina} />
          </Pressable>
        </View>
        <View style={s.bottomRight} pointerEvents="box-none">
          <SoundButton />
        </View>
      </View>
      <Pressable onPress={abrirLugar} style={s.info} accessibilityRole="link">
        <View style={s.infoRow}>
          <Txt variant="title" numberOfLines={1} style={{ flex: 1 }}>
            {item.place_name}
          </Txt>
          <Ionicons name="chevron-forward" size={20} color={colors.mut} />
        </View>
        <Txt variant="small" color={colors.mut}>
          {categoryLabel[item.place_category] ?? item.place_category}
          {item.place_neighborhood ? ` · ${item.place_neighborhood}` : ''} · {distancia(item.distance_m)}
        </Txt>
        {(item.place_recent_authors ?? 0) >= 2 ? (
          <View style={s.momentum}>
            <Ionicons name="people" size={13} color={colors.pulso} />
            <Txt variant="caption" color={colors.neblina}>
              {item.place_recent_authors} pessoas publicaram daqui na última hora
            </Txt>
          </View>
        ) : null}
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

/** Publicação dentro da página do lugar: toque abre em tela cheia. */
export function PlacePostCard({ post, placeId, playing }: { post: PlacePost; placeId: string; playing: boolean }) {
  return (
    <Pressable
      style={s.small}
      onPress={() => router.push({ pathname: '/video/[id]', params: { id: post.id } })}
      accessibilityRole="button"
      accessibilityLabel="Assistir vídeo em tela cheia">
      {post.media_url ? (
        <PostVideo uri={post.media_url} thumb={post.thumb_url} playing={playing} postId={post.id} placeId={placeId} />
      ) : null}
      <View style={s.top} pointerEvents="none">
        <PublishedTag
          publishedAt={post.sent_at ?? post.published_at}
          origin={post.origin}
          sponsored={post.sponsored}
          freshUntil={post.fresh_until}
        />
      </View>
      <View style={s.smallBottom} pointerEvents="none">
        {post.caption ? (
          <Txt variant="small" numberOfLines={2}>
            {post.caption}
          </Txt>
        ) : null}
        <Txt variant="caption" color={colors.neblina}>
          @{post.author_username}
        </Txt>
      </View>
    </Pressable>
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
  bottomRight: { position: 'absolute', right: space.md, bottom: space.md },
  round: { backgroundColor: 'rgba(23,33,31,0.78)', borderRadius: radius.pill, padding: 7 },
  info: { padding: space.md, gap: 2, backgroundColor: colors.carvao2 },
  infoRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  momentum: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 6 },
  fallback: { alignItems: 'center', justifyContent: 'center', gap: space.sm, backgroundColor: '#0E1513' },
  loading: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  retry: { backgroundColor: colors.pulso, paddingHorizontal: 14, paddingVertical: 8, borderRadius: radius.pill },
  small: {
    position: 'relative',
    width: 200,
    aspectRatio: 9 / 16,
    borderRadius: radius.md,
    overflow: 'hidden',
    backgroundColor: '#0E1513',
    justifyContent: 'space-between',
  },
  smallBottom: { padding: space.sm, gap: 2, backgroundColor: 'rgba(23,33,31,0.6)' },
});
