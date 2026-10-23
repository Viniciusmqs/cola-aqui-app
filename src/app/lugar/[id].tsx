import Ionicons from '@expo/vector-icons/Ionicons';
import * as Haptics from 'expo-haptics';
import * as Linking from 'expo-linking';
import { router, useIsFocused, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, FlatList, Pressable, ScrollView, StyleSheet, View, type ListViewToken } from 'react-native';

import { ChoiceSheet } from '@/components/choice-sheet';
import { PulseDot } from '@/components/brand';
import { PlacePostCard } from '@/components/post-card';
import { PlaceSkeleton } from '@/components/skeleton';
import { Button, Empty, Screen, SectionTitle, Txt } from '@/components/ui';
import { categoryLabel, colors, radius, space } from '@/constants/theme';
import { abrirRota, compartilharLugar, denunciaChoices, denunciar, rotaChoices } from '@/lib/actions';
import { track } from '@/lib/analytics';
import { useAuth, useRequireAuth } from '@/lib/auth';
import { useNow } from '@/lib/clock';
import {
  agoraBrasilia,
  dataEvento,
  diaSemana,
  horaCurta,
  mensagemDeErro,
  situacaoHorario,
  tempoDesde,
} from '@/lib/format';
import { usePlace, usePlaceInfo, usePlacePosts, useSaved, useToggleSave } from '@/lib/queries';
import type { PlacePost } from '@/lib/types';

/** Perfil do lugar (RF-05) com compartilhar, chegar e salvar (RF-08, RF-09). */
export default function Lugar() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { session } = useAuth();
  const requireAuth = useRequireAuth();
  const place = usePlace(id);
  const posts = usePlacePosts(id);
  const info = usePlaceInfo(id);
  const saved = useSaved();
  const toggle = useToggleSave();
  const [rota, setRota] = useState(false);
  const [denuncia, setDenuncia] = useState(false);
  const [visivel, setVisivel] = useState<string | null>(null);
  const focado = useIsFocused();
  const agora = useNow(); // hora do servidor, anda sozinha a cada 30 s

  // toca só o vídeo mais visível da fileira (mudo); toque abre em tela cheia
  const onViewable = useCallback(({ viewableItems }: { viewableItems: ListViewToken[] }) => {
    setVisivel((viewableItems[0]?.item as PlacePost | undefined)?.id ?? null);
  }, []);

  useEffect(() => {
    if (id) track('place_view', { place: id });
  }, [id]);

  const salvo = useMemo(
    () => !!session && ((saved.data ?? []) as { place_id: string }[]).some((s) => s.place_id === id),
    [saved.data, id, session],
  );

  const p = place.data;
  const lista = posts.data ?? [];
  const hoje = agoraBrasilia(agora).weekday;
  const horariosHoje = (info.data?.hours ?? []).filter((h) => h.weekday === hoje);
  const situacao = situacaoHorario(info.data?.hours ?? [], agora);

  if (!p) {
    return (
      <Screen>
        <BackBar />
        {place.isLoading ? (
          <PlaceSkeleton />
        ) : (
          <Empty title="Lugar não encontrado" text="Ele pode ter saído do catálogo." />
        )}
      </Screen>
    );
  }

  const destino = { id: p.id, name: p.name, lat: p.lat, lng: p.lng, address: p.address };

  return (
    <Screen>
      <BackBar />
      <ScrollView contentContainerStyle={{ padding: space.md, paddingBottom: space.xxl }}>
        <View style={{ gap: space.xs }}>
          <Txt variant="display">{p.name}</Txt>
          <Txt color={colors.mut}>
            {categoryLabel[p.category] ?? p.category}
            {p.neighborhood ? ` · ${p.neighborhood}` : ''}
          </Txt>
          {p.address ? (
            <Txt variant="small" color={colors.mut}>
              {p.address}
            </Txt>
          ) : null}
          <View style={s.badges}>
            {p.is_founder ? <Badge label="PARCEIRO FUNDADOR" bg={colors.pulso} fg={colors.carvao} /> : null}
            {p.has_manager ? (
              <Badge label="Informações oficiais do estabelecimento" bg={colors.carvao2} fg={colors.neblina} />
            ) : null}
          </View>
          <Txt
            variant="small"
            color={p.last_published_at ? colors.neblina : colors.mut}
            style={{ marginTop: space.sm }}>
            {p.last_published_at
              ? `Último vídeo publicado ${tempoDesde(p.last_published_at, agora)}`
              : 'Sem atualização recente'}
          </Txt>
          {situacao ? (
            <View style={s.status} accessibilityLabel={`${situacao.texto}, pelo horário informado`}>
              <PulseDot color={situacao.aberto ? colors.pulso : colors.mut} active={false} />
              <Txt variant="small" color={situacao.aberto ? colors.neblina : colors.mut}>
                {situacao.texto}
              </Txt>
              <Txt variant="caption" color={colors.mut}>
                pelo horário informado
              </Txt>
            </View>
          ) : null}
        </View>

        <View style={{ gap: space.sm, marginTop: space.lg }}>
          <Button
            title="Como chegar"
            icon={<Ionicons name="navigate" size={18} color={colors.carvao} />}
            onPress={() => setRota(true)}
          />
          <View style={{ flexDirection: 'row', gap: space.sm }}>
            <Button
              title={salvo ? 'Salvo' : 'Salvar'}
              kind="secondary"
              style={{ flex: 1 }}
              icon={
                <Ionicons
                  name={salvo ? 'bookmark' : 'bookmark-outline'}
                  size={18}
                  color={salvo ? colors.pulso : colors.neblina}
                />
              }
              onPress={() => {
                if (!requireAuth('salvar')) return;
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                toggle.mutate(
                  { placeId: p.id, saved: salvo },
                  { onError: (e) => Alert.alert('Não deu para salvar', mensagemDeErro(e)) },
                );
              }}
            />
            <Button
              title="Compartilhar"
              kind="secondary"
              style={{ flex: 1 }}
              icon={<Ionicons name="share-social-outline" size={18} color={colors.neblina} />}
              onPress={() => compartilharLugar(destino)}
            />
          </View>
        </View>

        <SectionTitle>Vídeos</SectionTitle>
        {lista.length === 0 ? (
          <Txt color={colors.mut}>Ninguém publicou deste lugar ainda.</Txt>
        ) : (
          <FlatList
            horizontal
            data={lista}
            keyExtractor={(x) => x.id}
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ gap: space.sm }}
            onViewableItemsChanged={onViewable}
            viewabilityConfig={{ itemVisiblePercentThreshold: 60 }}
            renderItem={({ item }) => (
              <PlacePostCard post={item} placeId={p.id} playing={focado && visivel === item.id} />
            )}
          />
        )}

        {(info.data?.events ?? []).length > 0 ? (
          <>
            <SectionTitle>Programação</SectionTitle>
            {(info.data?.events ?? []).map((e) => (
              <View key={e.id} style={s.card}>
                <Txt variant="small" color={colors.pulso}>
                  {dataEvento(e.starts_at, agora)}
                </Txt>
                <Txt variant="label">{e.title}</Txt>
                {e.description ? (
                  <Txt variant="small" color={colors.mut}>
                    {e.description}
                  </Txt>
                ) : null}
                {e.ticket_url ? (
                  <Pressable onPress={() => Linking.openURL(e.ticket_url!)}>
                    <Txt variant="small" color={colors.algodao}>
                      Ingressos ↗
                    </Txt>
                  </Pressable>
                ) : null}
              </View>
            ))}
            <Txt variant="caption" color={colors.mut}>
              Programação informada pelo estabelecimento. Evento agendado não indica movimento atual.
            </Txt>
          </>
        ) : null}

        {(info.data?.hours ?? []).length > 0 ? (
          <>
            <SectionTitle>Horário informado</SectionTitle>
            <View style={s.card}>
              {(info.data?.hours ?? []).map((h) => (
                <View key={h.id} style={s.hourRow}>
                  <Txt variant="small" color={h.weekday === hoje ? colors.neblina : colors.mut}>
                    {diaSemana(h.weekday)}
                  </Txt>
                  <Txt variant="small" color={h.weekday === hoje ? colors.neblina : colors.mut}>
                    {horaCurta(h.opens)} – {horaCurta(h.closes)}
                  </Txt>
                </View>
              ))}
              {horariosHoje.length === 0 ? (
                <Txt variant="small" color={colors.mut}>
                  Sem horário informado para hoje.
                </Txt>
              ) : null}
            </View>
            <Txt variant="caption" color={colors.mut}>
              Horário oficial do estabelecimento; não é confirmação em tempo real.
            </Txt>
          </>
        ) : null}

        {p.instagram || p.website || p.phone ? (
          <>
            <SectionTitle>Contato</SectionTitle>
            <View style={{ flexDirection: 'row', gap: space.sm, flexWrap: 'wrap' }}>
              {p.instagram ? (
                <Button
                  title={`@${p.instagram}`}
                  kind="ghost"
                  onPress={() => Linking.openURL(`https://instagram.com/${p.instagram}`)}
                />
              ) : null}
              {p.website ? <Button title="Site" kind="ghost" onPress={() => Linking.openURL(p.website!)} /> : null}
              {p.phone ? <Button title="Ligar" kind="ghost" onPress={() => Linking.openURL(`tel:${p.phone}`)} /> : null}
            </View>
          </>
        ) : null}

        <View style={{ marginTop: space.xl, gap: space.sm }}>
          {p.can_manage ? (
            <Button
              title="Abrir painel do parceiro"
              kind="secondary"
              onPress={() => router.push({ pathname: '/parceiro/[id]', params: { id: p.id } })}
            />
          ) : (
            <Pressable
              onPress={() =>
                requireAuth('reivindicar') && router.push({ pathname: '/reivindicar/[id]', params: { id: p.id } })
              }
              style={{ padding: space.sm }}>
              <Txt variant="small" color={colors.algodao}>
                É responsável por este lugar? Reivindique o perfil
              </Txt>
            </Pressable>
          )}
          <Pressable onPress={() => setDenuncia(true)} style={{ padding: space.sm }}>
            <Txt variant="small" color={colors.mut}>
              Denunciar informação errada ou lugar falso
            </Txt>
          </Pressable>
        </View>
      </ScrollView>

      <ChoiceSheet
        visible={rota}
        title={`Como chegar em ${p.name}`}
        choices={rotaChoices}
        onClose={() => setRota(false)}
        onSelect={(app) => abrirRota(destino, app)}
      />
      <ChoiceSheet
        visible={denuncia}
        title="Denunciar este lugar"
        choices={denunciaChoices}
        onClose={() => setDenuncia(false)}
        onSelect={(reason) => requireAuth('denunciar') && denunciar({ place: p.id }, reason)}
      />
    </Screen>
  );
}

function BackBar() {
  return (
    <View style={{ paddingHorizontal: space.sm, paddingVertical: space.xs }}>
      <Pressable
        onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}
        hitSlop={12}
        accessibilityLabel="Voltar">
        <Ionicons name="chevron-back" size={28} color={colors.neblina} />
      </Pressable>
    </View>
  );
}

function Badge({ label, bg, fg }: { label: string; bg: string; fg: string }) {
  return (
    <View style={[s.badge, { backgroundColor: bg }]}>
      <Txt variant="caption" color={fg}>
        {label}
      </Txt>
    </View>
  );
}

const s = StyleSheet.create({
  badges: { flexDirection: 'row', gap: space.sm, flexWrap: 'wrap', marginTop: space.sm },
  badge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: radius.pill },
  card: { gap: 4, padding: space.md, backgroundColor: colors.carvao2, borderRadius: radius.md, marginBottom: space.sm },
  hourRow: { flexDirection: 'row', justifyContent: 'space-between' },
  status: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginTop: 2 },
});
