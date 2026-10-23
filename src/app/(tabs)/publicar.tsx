import Ionicons from '@expo/vector-icons/Ionicons';
import { useQueryClient } from '@tanstack/react-query';
import { CameraView, useCameraPermissions, useMicrophonePermissions } from 'expo-camera';
import * as Haptics from 'expo-haptics';
import * as ImagePicker from 'expo-image-picker';
import { router } from 'expo-router';
import { useVideoPlayer, VideoView } from 'expo-video';
import * as VideoThumbnails from 'expo-video-thumbnails';
import { useEffect, useRef, useState } from 'react';
import {
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';

import { RegionChip } from '@/components/region-chip';
import { Button, Empty, LoginGate, Screen, Txt } from '@/components/ui';
import { categoryLabel, colors, fonts, radius, space } from '@/constants/theme';
import { useAuth } from '@/lib/auth';
import { distancia, mensagemDeErro } from '@/lib/format';
import { usePlacesNearby } from '@/lib/queries';
import { MEDIA_BUCKET, supabase } from '@/lib/supabase';
import type { NearbyPlace } from '@/lib/types';

const MAX_SEG = 20; // hipótese do PRD (10–20 s); o servidor confere pelo app_config
const MAX_MB = 60;

type Video = { uri: string; mime: string; duration: number | null; size: number | null };
type Etapa =
  | { tipo: 'lugar' }
  | { tipo: 'midia'; lugar: NearbyPlace }
  | { tipo: 'camera'; lugar: NearbyPlace }
  | { tipo: 'revisar'; lugar: NearbyPlace; video: Video }
  | { tipo: 'enviado'; lugar: NearbyPlace; publicado: boolean };

/** Publicação de experiência (RF-07, jornada 2.3). */
export default function Publicar() {
  const { session } = useAuth();
  const [etapa, setEtapa] = useState<Etapa>({ tipo: 'lugar' });

  if (!session) {
    return (
      <LoginGate
        title="Mostre como tá o lugar"
        text="Para publicar um vídeo, entre na sua conta. Explorar continua liberado sem cadastro."
      />
    );
  }

  switch (etapa.tipo) {
    case 'midia':
      return (
        <EscolherMidia
          lugar={etapa.lugar}
          onVoltar={() => setEtapa({ tipo: 'lugar' })}
          onCamera={() => setEtapa({ tipo: 'camera', lugar: etapa.lugar })}
          onVideo={(video) => setEtapa({ tipo: 'revisar', lugar: etapa.lugar, video })}
        />
      );
    case 'camera':
      return (
        <Camera
          lugar={etapa.lugar}
          onCancel={() => setEtapa({ tipo: 'midia', lugar: etapa.lugar })}
          onGravado={(video) => setEtapa({ tipo: 'revisar', lugar: etapa.lugar, video })}
        />
      );
    case 'revisar':
      return (
        <Revisar
          lugar={etapa.lugar}
          video={etapa.video}
          onVoltar={() => setEtapa({ tipo: 'midia', lugar: etapa.lugar })}
          onEnviado={(publicado) => setEtapa({ tipo: 'enviado', lugar: etapa.lugar, publicado })}
        />
      );
    case 'enviado':
      return (
        <Screen style={{ justifyContent: 'center' }}>
          <Empty
            title={etapa.publicado ? 'Publicado!' : 'Enviado para análise'}
            text={
              etapa.publicado
                ? `Seu vídeo já aparece em ${etapa.lugar.name}.`
                : `Seu vídeo de ${etapa.lugar.name} passa por uma revisão rápida e aparece no lugar assim que for aprovado. Você acompanha no seu perfil.`
            }
            action={
              <View style={{ gap: space.sm }}>
                <Button title="Ver no meu perfil" onPress={() => router.navigate('/perfil')} />
                <Button title="Publicar outro" kind="ghost" onPress={() => setEtapa({ tipo: 'lugar' })} />
              </View>
            }
          />
        </Screen>
      );
    default:
      return <EscolherLugar onEscolher={(lugar) => setEtapa({ tipo: 'midia', lugar })} />;
  }
}

function EscolherLugar({ onEscolher }: { onEscolher: (p: NearbyPlace) => void }) {
  const [busca, setBusca] = useState('');
  const lugares = usePlacesNearby({ search: busca });

  return (
    <Screen>
      <FlatList
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ padding: space.md, gap: space.sm, flexGrow: 1 }}
        data={lugares.data ?? []}
        keyExtractor={(p) => p.id}
        ListHeaderComponent={
          <View style={{ gap: space.md, marginBottom: space.sm }}>
            <View style={s.rowBetween}>
              <Txt variant="title">Publicar</Txt>
              <RegionChip />
            </View>
            <Txt color={colors.mut}>De qual lugar é o vídeo?</Txt>
            <View style={s.search}>
              <Ionicons name="search" size={18} color={colors.mut} />
              <TextInput
                value={busca}
                onChangeText={setBusca}
                placeholder="Buscar lugar"
                placeholderTextColor={colors.mut}
                style={s.searchInput}
                autoCorrect={false}
              />
            </View>
          </View>
        }
        renderItem={({ item }) => (
          <Pressable onPress={() => onEscolher(item)} style={({ pressed }) => [s.lugar, pressed && { opacity: 0.8 }]}>
            <View style={{ flex: 1 }}>
              <Txt variant="label">{item.name}</Txt>
              <Txt variant="small" color={colors.mut}>
                {categoryLabel[item.category] ?? item.category}
                {item.neighborhood ? ` · ${item.neighborhood}` : ''} · {distancia(item.distance_m)}
              </Txt>
            </View>
            <Ionicons name="chevron-forward" size={20} color={colors.mut} />
          </Pressable>
        )}
        ListEmptyComponent={
          lugares.isLoading ? undefined : (
            <Empty
              title="Nenhum lugar encontrado"
              text="Só dá para publicar em lugares do catálogo. Tente outro nome ou outra região."
            />
          )
        }
      />
    </Screen>
  );
}

function EscolherMidia({
  lugar,
  onVoltar,
  onCamera,
  onVideo,
}: {
  lugar: NearbyPlace;
  onVoltar: () => void;
  onCamera: () => void;
  onVideo: (v: Video) => void;
}) {
  const [erro, setErro] = useState<string | null>(null);

  async function galeria() {
    setErro(null);
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['videos'],
      videoMaxDuration: MAX_SEG,
      allowsEditing: true,
      quality: 1,
    });
    if (res.canceled || !res.assets[0]) return;
    const a = res.assets[0];
    const dur = a.duration ? a.duration / 1000 : null;
    if (dur && dur > MAX_SEG + 0.5) return setErro(`O vídeo pode ter até ${MAX_SEG} segundos. Corte antes de enviar.`);
    if (a.fileSize && a.fileSize > MAX_MB * 1024 * 1024) return setErro(`O vídeo pode ter até ${MAX_MB} MB.`);
    onVideo({ uri: a.uri, mime: a.mimeType ?? 'video/mp4', duration: dur, size: a.fileSize ?? null });
  }

  return (
    <Screen>
      <ScrollView contentContainerStyle={{ padding: space.md, gap: space.md }}>
        <Pressable onPress={onVoltar} hitSlop={12} accessibilityLabel="Voltar">
          <Ionicons name="chevron-back" size={26} color={colors.neblina} />
        </Pressable>
        <Txt variant="title">{lugar.name}</Txt>
        <Txt color={colors.mut}>
          Mostre como o lugar está: ambiente, atração, comida, fila. Vídeos de até {MAX_SEG} segundos.
        </Txt>
        <Pressable style={s.option} onPress={onCamera} accessibilityRole="button">
          <Ionicons name="videocam" size={26} color={colors.pulso} />
          <View style={{ flex: 1 }}>
            <Txt variant="label">Gravar agora</Txt>
            <Txt variant="small" color={colors.mut}>
              Abre a câmera do app
            </Txt>
          </View>
        </Pressable>
        <Pressable style={s.option} onPress={galeria} accessibilityRole="button">
          <Ionicons name="images" size={26} color={colors.algodao} />
          <View style={{ flex: 1 }}>
            <Txt variant="label">Escolher da galeria</Txt>
            <Txt variant="small" color={colors.mut}>
              Um vídeo que você acabou de gravar
            </Txt>
          </View>
        </Pressable>
        {erro ? <Txt color={colors.erro}>{erro}</Txt> : null}
      </ScrollView>
    </Screen>
  );
}

function Camera({
  lugar,
  onCancel,
  onGravado,
}: {
  lugar: NearbyPlace;
  onCancel: () => void;
  onGravado: (v: Video) => void;
}) {
  const ref = useRef<CameraView>(null);
  const [cam, pedirCam] = useCameraPermissions();
  const [mic, pedirMic] = useMicrophonePermissions();
  const [gravando, setGravando] = useState(false);
  const [seg, setSeg] = useState(0);
  const [frente, setFrente] = useState(false);

  useEffect(() => {
    if (!gravando) return;
    const t = setInterval(() => setSeg((x) => Math.min(x + 1, MAX_SEG)), 1000);
    return () => clearInterval(t);
  }, [gravando]);

  if (!cam || !mic) return <Screen>{null}</Screen>;
  if (!cam.granted || !mic.granted) {
    return (
      <Screen style={{ justifyContent: 'center' }}>
        <Empty
          title="Câmera e microfone"
          text="Para gravar pelo app, libere a câmera e o microfone. Se preferir, volte e escolha um vídeo da galeria."
          action={
            <View style={{ gap: space.sm }}>
              <Button
                title="Liberar câmera e microfone"
                onPress={async () => {
                  await pedirCam();
                  await pedirMic();
                }}
              />
              <Button title="Voltar" kind="ghost" onPress={onCancel} />
            </View>
          }
        />
      </Screen>
    );
  }

  async function gravar() {
    if (!ref.current) return;
    if (gravando) {
      ref.current.stopRecording();
      return;
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setSeg(0);
    setGravando(true);
    const inicio = Date.now();
    try {
      const video = await ref.current.recordAsync({ maxDuration: MAX_SEG });
      if (video?.uri) {
        const mime = video.uri.toLowerCase().endsWith('.mov') ? 'video/quicktime' : 'video/mp4';
        onGravado({ uri: video.uri, mime, duration: Math.min(MAX_SEG, (Date.now() - inicio) / 1000), size: null });
      }
    } finally {
      setGravando(false);
    }
  }

  return (
    <View style={{ flex: 1, backgroundColor: '#000' }}>
      <CameraView ref={ref} style={StyleSheet.absoluteFill} mode="video" facing={frente ? 'front' : 'back'} />
      <Screen style={s.camOverlay} edges={['top', 'bottom']}>
        <View style={s.rowBetween}>
          <Pressable onPress={onCancel} hitSlop={12} disabled={gravando} accessibilityLabel="Fechar câmera">
            <Ionicons name="close" size={28} color={colors.neblina} />
          </Pressable>
          <View style={s.camPlace}>
            <Txt variant="label">{lugar.name}</Txt>
          </View>
          <Pressable
            onPress={() => setFrente((f) => !f)}
            hitSlop={12}
            disabled={gravando}
            accessibilityLabel="Virar câmera">
            <Ionicons name="camera-reverse-outline" size={28} color={colors.neblina} />
          </Pressable>
        </View>
        <View style={{ alignItems: 'center', gap: space.md }}>
          <Txt variant="label" color={gravando ? colors.rosa : colors.neblina}>
            {gravando ? `${seg}s / ${MAX_SEG}s` : `Toque para gravar até ${MAX_SEG}s`}
          </Txt>
          <Pressable onPress={gravar} style={s.rec} accessibilityLabel={gravando ? 'Parar gravação' : 'Gravar'}>
            <View style={[s.recInner, gravando && s.recStop]} />
          </Pressable>
        </View>
      </Screen>
    </View>
  );
}

function Revisar({
  lugar,
  video,
  onVoltar,
  onEnviado,
}: {
  lugar: NearbyPlace;
  video: Video;
  onVoltar: () => void;
  onEnviado: (publicado: boolean) => void;
}) {
  const { session } = useAuth();
  const qc = useQueryClient();
  const [legenda, setLegenda] = useState('');
  const [aceite, setAceite] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [progresso, setProgresso] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const player = useVideoPlayer(video.uri, (p) => {
    p.loop = true;
    p.play();
  });

  async function enviar() {
    if (!session) return;
    setErro(null);
    setEnviando(true);
    try {
      setProgresso('Enviando vídeo…');
      const ext = video.mime === 'video/quicktime' ? 'mov' : 'mp4';
      const path = `${session.user.id}/${Date.now()}.${ext}`;
      const body = await (await fetch(video.uri)).arrayBuffer();
      const up = await supabase.storage.from(MEDIA_BUCKET).upload(path, body, { contentType: video.mime });
      if (up.error) throw up.error;

      // miniatura (capa enquanto o vídeo carrega no feed); se falhar, publica sem ela
      let thumbPath: string | null = null;
      if (Platform.OS !== 'web') {
        try {
          const thumb = await VideoThumbnails.getThumbnailAsync(video.uri, { time: 500, quality: 0.7 });
          const tBody = await (await fetch(thumb.uri)).arrayBuffer();
          const tPath = `${session.user.id}/${Date.now()}_thumb.jpg`;
          const tUp = await supabase.storage.from(MEDIA_BUCKET).upload(tPath, tBody, { contentType: 'image/jpeg' });
          if (!tUp.error) thumbPath = tPath;
        } catch {
          thumbPath = null;
        }
      }

      setProgresso('Registrando publicação…');
      const { data, error } = await supabase.rpc('create_post', {
        p_place: lugar.id,
        p_media_path: path,
        p_mime: video.mime,
        p_size_bytes: video.size ?? body.byteLength,
        p_duration_s: video.duration,
        p_caption: legenda,
        p_accept_policies: aceite,
        p_thumb_path: thumbPath,
      });
      if (error) {
        await supabase.storage.from(MEDIA_BUCKET).remove(thumbPath ? [path, thumbPath] : [path]);
        throw error;
      }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      qc.invalidateQueries({ queryKey: ['my-posts'] });
      const status = (data as { status: string }[] | null)?.[0]?.status;
      onEnviado(status === 'published');
    } catch (e) {
      setErro(mensagemDeErro(e));
    } finally {
      setEnviando(false);
      setProgresso(null);
    }
  }

  return (
    <Screen edges={['top', 'bottom']}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={s.preview}>
          <VideoView player={player} style={StyleSheet.absoluteFill} contentFit="cover" nativeControls={false} />
        </View>
        <View style={{ padding: space.md, gap: space.md }}>
          <Txt variant="label">{lugar.name}</Txt>
          <TextInput
            value={legenda}
            onChangeText={setLegenda}
            maxLength={140}
            placeholder="Descrição (opcional)"
            placeholderTextColor={colors.mut}
            style={s.legenda}
          />
          <Pressable
            onPress={() => setAceite((a) => !a)}
            style={s.check}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: aceite }}>
            <Ionicons
              name={aceite ? 'checkbox' : 'square-outline'}
              size={22}
              color={aceite ? colors.pulso : colors.mut}
            />
            <Txt variant="small" style={{ flex: 1 }}>
              O vídeo é deste lugar, não expõe menores nem pessoas em situação constrangedora e segue as políticas de
              publicação.
            </Txt>
          </Pressable>
          {erro ? <Txt color={colors.erro}>{erro}</Txt> : null}
          {progresso ? (
            <Txt variant="small" color={colors.mut}>
              {progresso}
            </Txt>
          ) : null}
          <View style={{ flexDirection: 'row', gap: space.sm }}>
            <Button title="Voltar" kind="ghost" onPress={onVoltar} disabled={enviando} style={{ flex: 1 }} />
            <Button title="Enviar" onPress={enviar} loading={enviando} disabled={!aceite} style={{ flex: 2 }} />
          </View>
        </View>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const s = StyleSheet.create({
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    backgroundColor: colors.carvao2,
    borderRadius: radius.md,
    paddingHorizontal: space.md,
  },
  searchInput: { flex: 1, minHeight: 48, color: colors.neblina, fontFamily: fonts.regular, fontSize: 16 },
  lugar: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: space.md,
    backgroundColor: colors.carvao2,
    borderRadius: radius.md,
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    padding: space.lg,
    backgroundColor: colors.carvao2,
    borderRadius: radius.lg,
  },
  camOverlay: { backgroundColor: 'transparent', justifyContent: 'space-between', padding: space.md },
  camPlace: {
    backgroundColor: 'rgba(23,33,31,0.7)',
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: radius.pill,
  },
  rec: {
    width: 78,
    height: 78,
    borderRadius: 39,
    borderWidth: 4,
    borderColor: colors.neblina,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: space.md,
  },
  recInner: { width: 60, height: 60, borderRadius: 30, backgroundColor: colors.rosa },
  recStop: { width: 30, height: 30, borderRadius: 6 },
  preview: { flex: 1, margin: space.sm, borderRadius: radius.lg, overflow: 'hidden', backgroundColor: colors.carvao2 },
  legenda: {
    minHeight: 48,
    borderRadius: radius.md,
    backgroundColor: colors.carvao2,
    paddingHorizontal: space.md,
    color: colors.neblina,
    fontFamily: fonts.regular,
    fontSize: 16,
  },
  check: { flexDirection: 'row', gap: space.sm, alignItems: 'flex-start' },
});
