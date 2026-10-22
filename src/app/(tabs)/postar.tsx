import Ionicons from '@expo/vector-icons/Ionicons';
import { useQueryClient } from '@tanstack/react-query';
import { CameraView, useCameraPermissions, useMicrophonePermissions } from 'expo-camera';
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useEffect, useRef, useState } from 'react';
import { FlatList, KeyboardAvoidingView, Platform, Pressable, StyleSheet, TextInput, View } from 'react-native';

import { Button, Empty, Screen, Txt } from '@/components/ui';
import { colors, fonts, placeKindLabel, radius, space } from '@/constants/theme';
import { useAuth } from '@/lib/auth';
import { distancia, mensagemDeErro } from '@/lib/format';
import { useUserLocation } from '@/lib/location';
import { usePlacesNearby } from '@/lib/queries';
import { BUCKET, supabase } from '@/lib/supabase';
import type { NearbyPlace } from '@/lib/types';

const MAX_SEG = 15;
const RAIO_POSTAR = 150;

type Etapa = { tipo: 'lugar' } | { tipo: 'camera'; lugar: NearbyPlace } | { tipo: 'revisar'; lugar: NearbyPlace; uri: string; gravadoEm: string };

export default function Postar() {
  const [etapa, setEtapa] = useState<Etapa>({ tipo: 'lugar' });

  if (etapa.tipo === 'camera') {
    return (
      <Camera
        lugar={etapa.lugar}
        onCancel={() => setEtapa({ tipo: 'lugar' })}
        onGravado={(uri, gravadoEm) => setEtapa({ tipo: 'revisar', lugar: etapa.lugar, uri, gravadoEm })}
      />
    );
  }
  if (etapa.tipo === 'revisar') {
    return (
      <Revisar
        {...etapa}
        onRefazer={() => setEtapa({ tipo: 'camera', lugar: etapa.lugar })}
        onPublicado={() => {
          setEtapa({ tipo: 'lugar' });
          router.navigate('/');
        }}
      />
    );
  }
  return <EscolherLugar onEscolher={(lugar) => setEtapa({ tipo: 'camera', lugar })} />;
}

function EscolherLugar({ onEscolher }: { onEscolher: (p: NearbyPlace) => void }) {
  const loc = useUserLocation();
  const perto = usePlacesNearby(loc.coords, RAIO_POSTAR);

  return (
    <Screen>
      <FlatList
        contentContainerStyle={{ padding: space.md, gap: space.sm, flexGrow: 1 }}
        data={loc.real ? (perto.data ?? []) : []}
        keyExtractor={(p) => p.id}
        ListHeaderComponent={
          <View style={{ gap: space.sm, marginBottom: space.md }}>
            <Txt variant="title">Onde você tá?</Txt>
            <Txt color={colors.mut}>
              Só dá para postar de onde você está agora (até {RAIO_POSTAR} m do lugar). O vídeo fica no ar por 4 horas.
            </Txt>
          </View>
        }
        renderItem={({ item }) => (
          <Pressable onPress={() => onEscolher(item)} style={({ pressed }) => [s.lugar, pressed && { opacity: 0.8 }]}>
            <View style={{ flex: 1 }}>
              <Txt variant="label">{item.nome}</Txt>
              <Txt variant="small" color={colors.mut}>
                {placeKindLabel[item.tipo] ?? item.tipo} · {distancia(item.distancia_m)}
              </Txt>
            </View>
            <Ionicons name="videocam" size={22} color={colors.pulso} />
          </Pressable>
        )}
        ListEmptyComponent={
          loc.status === 'carregando' || perto.isLoading ? (
            <Empty title="Achando você…" text="Pegando sua localização." />
          ) : loc.status !== 'ok' ? (
            <Empty
              title="Precisamos da sua localização"
              text="É assim que garantimos que todo registro foi feito no lugar, na hora."
              action={<Button title="Liberar localização" onPress={() => loc.refresh()} />}
            />
          ) : (
            <Empty
              title="Nenhum lugar aqui pertinho"
              text="Você não está a até 150 m de um lugar cadastrado. Chegou num rolê que não aparece? Em breve dá para sugerir."
              action={<Button title="Atualizar localização" kind="secondary" onPress={() => loc.refresh()} />}
            />
          )
        }
      />
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
  onGravado: (uri: string, gravadoEm: string) => void;
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
          text="O Cola Aqui só aceita vídeo gravado na hora pelo app, para ninguém postar foto velha."
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
    const inicio = new Date().toISOString();
    try {
      const video = await ref.current.recordAsync({ maxDuration: MAX_SEG });
      if (video?.uri) onGravado(video.uri, inicio);
    } finally {
      setGravando(false);
    }
  }

  return (
    <View style={{ flex: 1, backgroundColor: '#000' }}>
      <CameraView ref={ref} style={StyleSheet.absoluteFill} mode="video" facing={frente ? 'front' : 'back'} />
      <Screen style={s.camOverlay} edges={['top', 'bottom']}>
        <View style={s.camTop}>
          <Pressable onPress={onCancel} hitSlop={12} disabled={gravando} accessibilityLabel="Fechar câmera">
            <Ionicons name="close" size={28} color={colors.neblina} />
          </Pressable>
          <View style={s.camPlace}>
            <Txt variant="label">{lugar.nome}</Txt>
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
  uri,
  gravadoEm,
  onRefazer,
  onPublicado,
}: {
  lugar: NearbyPlace;
  uri: string;
  gravadoEm: string;
  onRefazer: () => void;
  onPublicado: () => void;
}) {
  const { session } = useAuth();
  const qc = useQueryClient();
  const loc = useUserLocation();
  const [legenda, setLegenda] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const player = useVideoPlayer(uri, (p) => {
    p.loop = true;
    p.play();
  });

  async function publicar() {
    if (!session) return;
    setErro(null);
    setEnviando(true);
    try {
      const coords = (await loc.refresh()) ?? (loc.real ? loc.coords : null);
      if (!coords) throw new Error('Não conseguimos confirmar sua localização.');

      const ext = uri.toLowerCase().endsWith('.mov') ? 'mov' : 'mp4';
      const path = `${session.user.id}/${Date.now()}.${ext}`;
      const body = await (await fetch(uri)).arrayBuffer();
      const up = await supabase.storage
        .from(BUCKET)
        .upload(path, body, { contentType: ext === 'mov' ? 'video/quicktime' : 'video/mp4' });
      if (up.error) throw up.error;

      const { error } = await supabase.rpc('create_post', {
        p_place: lugar.id,
        p_midia_path: path,
        p_lat: coords.lat,
        p_lng: coords.lng,
        p_tipo: 'video',
        p_legenda: legenda,
        p_gravado_em: gravadoEm,
      });
      if (error) {
        await supabase.storage.from(BUCKET).remove([path]);
        throw error;
      }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      qc.invalidateQueries({ queryKey: ['feed'] });
      qc.invalidateQueries({ queryKey: ['places'] });
      qc.invalidateQueries({ queryKey: ['my-posts'] });
      onPublicado();
    } catch (e) {
      setErro(mensagemDeErro(e));
    } finally {
      setEnviando(false);
    }
  }

  return (
    <Screen edges={['top', 'bottom']}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={s.preview}>
          <VideoView player={player} style={StyleSheet.absoluteFill} contentFit="cover" nativeControls={false} />
        </View>
        <View style={{ padding: space.md, gap: space.md }}>
          <Txt variant="label">{lugar.nome}</Txt>
          <TextInput
            value={legenda}
            onChangeText={setLegenda}
            maxLength={140}
            placeholder="Como tá aí? (opcional)"
            placeholderTextColor={colors.mut}
            style={s.legenda}
          />
          {erro ? <Txt color={colors.erro}>{erro}</Txt> : null}
          <View style={{ flexDirection: 'row', gap: space.sm }}>
            <Button title="Refazer" kind="ghost" onPress={onRefazer} disabled={enviando} style={{ flex: 1 }} />
            <Button title="Publicar" onPress={publicar} loading={enviando} style={{ flex: 2 }} />
          </View>
        </View>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const s = StyleSheet.create({
  lugar: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: space.md,
    backgroundColor: colors.carvao2,
    borderRadius: radius.md,
  },
  camOverlay: { backgroundColor: 'transparent', justifyContent: 'space-between', padding: space.md },
  camTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
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
});
