import { Link } from 'expo-router';
import { useVideoPlayer, VideoView } from 'expo-video';
import { Image } from 'expo-image';
import { useEffect } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { colors, placeKindLabel, radius, space } from '@/constants/theme';
import { distancia, haQuanto } from '@/lib/format';
import { mediaUrl } from '@/lib/supabase';
import type { FeedItem } from '@/lib/types';

import { TimeOriginTag, Txt } from './ui';

function VideoMedia({ uri, playing }: { uri: string; playing: boolean }) {
  const player = useVideoPlayer(uri, (p) => {
    p.loop = true;
    p.muted = true;
  });
  useEffect(() => {
    if (playing) player.play();
    else player.pause();
  }, [playing, player]);
  return <VideoView player={player} style={StyleSheet.absoluteFill} contentFit="cover" nativeControls={false} />;
}

export function PostCard({ item, height, playing }: { item: FeedItem; height: number; playing: boolean }) {
  const uri = mediaUrl(item.midia_path);
  return (
    <View style={[s.card, { height }]}>
      {item.tipo === 'video' ? (
        <VideoMedia uri={uri} playing={playing} />
      ) : (
        <Image source={{ uri }} style={StyleSheet.absoluteFill} contentFit="cover" />
      )}
      <View style={s.top}>
        <TimeOriginTag ha={haQuanto(item.created_at)} origem={item.origem} />
      </View>
      <View style={s.bottom}>
        <Link href={{ pathname: '/lugar/[id]', params: { id: item.place_id } }} asChild>
          <Pressable accessibilityRole="link">
            <Txt variant="title">{item.place_nome}</Txt>
            <Txt variant="small" color={colors.neblina}>
              {placeKindLabel[item.place_tipo] ?? item.place_tipo}
              {item.place_bairro ? ` · ${item.place_bairro}` : ''} · {distancia(item.distancia_m)}
            </Txt>
          </Pressable>
        </Link>
        {item.legenda ? <Txt style={{ marginTop: 6 }}>{item.legenda}</Txt> : null}
        <Txt variant="small" color={colors.mut} style={{ marginTop: 4 }}>
          @{item.autor_username}
        </Txt>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  card: {
    backgroundColor: colors.carvao2,
    borderRadius: radius.lg,
    overflow: 'hidden',
    justifyContent: 'space-between',
  },
  top: { padding: space.md },
  bottom: {
    padding: space.md,
    paddingTop: space.xl,
    backgroundColor: 'rgba(23,33,31,0.55)',
  },
});
