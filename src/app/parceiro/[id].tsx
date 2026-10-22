import Ionicons from '@expo/vector-icons/Ionicons';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { Button, Empty, Field, Screen, SectionTitle, Txt } from '@/components/ui';
import { colors, radius, space } from '@/constants/theme';
import { dataEvento, mensagemDeErro, parseDataHoraBR } from '@/lib/format';
import { usePlace, usePlaceInfo } from '@/lib/queries';
import { supabase } from '@/lib/supabase';

/** Métricas de intenção, nunca "visita" (PRD 6.4, QA-11). */
const METRICAS: { key: string; label: string; hint: string }[] = [
  { key: 'place_view', label: 'Aberturas do perfil', hint: 'Pessoas que abriram a página do lugar' },
  { key: 'route_click', label: 'Cliques em "Como chegar"', hint: 'Intenção de ir; não confirma visita' },
  { key: 'share_click', label: 'Compartilhamentos', hint: 'Toques em compartilhar' },
  { key: 'place_save', label: 'Salvos', hint: 'Pessoas que salvaram o lugar' },
  { key: 'post_play', label: 'Vídeos reproduzidos', hint: 'Reproduções dos vídeos do lugar' },
];

/** Painel Cola Parceiros (RF-10): só para gestor aprovado deste lugar (QA-08). */
export default function Parceiro() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const qc = useQueryClient();
  const place = usePlace(id);
  const info = usePlaceInfo(id);
  const metrics = useQuery({
    queryKey: ['partner-analytics', id],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('partner_analytics', { p_place: id, p_days: 30 });
      if (error) throw error;
      return new Map(
        ((data ?? []) as { event_name: string; total: number; last_7_days: number }[]).map((r) => [r.event_name, r]),
      );
    },
  });

  const p = place.data;
  const [form, setForm] = useState<Record<string, string> | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [evTitulo, setEvTitulo] = useState('');
  const [evData, setEvData] = useState('');
  const [evDesc, setEvDesc] = useState('');
  const [evErro, setEvErro] = useState<string | null>(null);

  if (!p) {
    return (
      <Screen>
        <BackBar />
        {place.isLoading ? null : (
          <Empty title="Sem acesso" text="Este painel é só para gestores aprovados do lugar." />
        )}
      </Screen>
    );
  }
  if (!p.can_manage) {
    return (
      <Screen>
        <BackBar />
        <Empty title="Sem acesso" text="Este painel é só para gestores aprovados do lugar." />
      </Screen>
    );
  }

  const dados = form ?? {
    address: p.address ?? '',
    neighborhood: p.neighborhood ?? '',
    phone: p.phone ?? '',
    instagram: p.instagram ?? '',
    website: p.website ?? '',
  };
  const set = (k: string) => (v: string) => setForm({ ...dados, [k]: v });

  async function salvarDados() {
    setSalvando(true);
    const limpo = Object.fromEntries(Object.entries(dados).map(([k, v]) => [k, v.trim() || null]));
    const { error } = await supabase
      .from('places')
      .update({ ...limpo, instagram: limpo.instagram?.replace(/^@/, '') ?? null, updated_at: new Date().toISOString() })
      .eq('id', id);
    setSalvando(false);
    if (error) Alert.alert('Não deu para salvar', mensagemDeErro(error));
    else {
      setForm(null);
      qc.invalidateQueries({ queryKey: ['place', id] });
      Alert.alert('Salvo', 'Os dados oficiais foram atualizados.');
    }
  }

  async function adicionarEvento() {
    setEvErro(null);
    const iso = parseDataHoraBR(evData);
    if (evTitulo.trim().length < 3) return setEvErro('Dê um nome para o evento.');
    if (!iso) return setEvErro('Use o formato DD/MM/AAAA HH:MM.');
    const { error } = await supabase.from('place_events').insert({
      place_id: id,
      title: evTitulo.trim(),
      description: evDesc.trim() || null,
      starts_at: iso,
    });
    if (error) return setEvErro(mensagemDeErro(error));
    setEvTitulo('');
    setEvData('');
    setEvDesc('');
    qc.invalidateQueries({ queryKey: ['place-info', id] });
  }

  async function removerEvento(evId: string) {
    const { error } = await supabase.from('place_events').delete().eq('id', evId);
    if (error) Alert.alert('Não deu para remover', mensagemDeErro(error));
    else qc.invalidateQueries({ queryKey: ['place-info', id] });
  }

  return (
    <Screen>
      <BackBar />
      <ScrollView
        contentContainerStyle={{ padding: space.md, paddingBottom: space.xxl }}
        keyboardShouldPersistTaps="handled">
        <Txt variant="caption" color={colors.pulso}>
          COLA PARCEIROS
        </Txt>
        <Txt variant="title">{p.name}</Txt>

        <SectionTitle>Últimos 30 dias</SectionTitle>
        <View style={s.grid}>
          {METRICAS.map((m) => {
            const r = metrics.data?.get(m.key);
            return (
              <View key={m.key} style={s.metric}>
                <Txt variant="title" color={colors.pulso}>
                  {r?.total ?? 0}
                </Txt>
                <Txt variant="small">{m.label}</Txt>
                <Txt variant="caption" color={colors.mut}>
                  {m.hint} · {r?.last_7_days ?? 0} nos últimos 7 dias
                </Txt>
              </View>
            );
          })}
        </View>

        <SectionTitle>Dados oficiais</SectionTitle>
        <View style={{ gap: space.md }}>
          <Field label="Endereço" value={dados.address} onChangeText={set('address')} />
          <Field label="Bairro" value={dados.neighborhood} onChangeText={set('neighborhood')} />
          <Field
            label="Telefone ou WhatsApp"
            value={dados.phone}
            onChangeText={set('phone')}
            keyboardType="phone-pad"
          />
          <Field
            label="Instagram"
            value={dados.instagram}
            onChangeText={set('instagram')}
            autoCapitalize="none"
            placeholder="@seulugar"
          />
          <Field
            label="Site"
            value={dados.website}
            onChangeText={set('website')}
            autoCapitalize="none"
            placeholder="https://"
          />
          <Button title="Salvar dados" onPress={salvarDados} loading={salvando} disabled={!form} />
          <Txt variant="caption" color={colors.mut}>
            Mudança de nome ou localização no mapa: fale com a equipe Cola Aqui.
          </Txt>
        </View>

        <SectionTitle>Programação</SectionTitle>
        {(info.data?.events ?? []).map((e) => (
          <View key={e.id} style={s.event}>
            <View style={{ flex: 1 }}>
              <Txt variant="small" color={colors.pulso}>
                {dataEvento(e.starts_at)}
              </Txt>
              <Txt variant="label">{e.title}</Txt>
            </View>
            <Pressable onPress={() => removerEvento(e.id)} hitSlop={12} accessibilityLabel={`Remover ${e.title}`}>
              <Ionicons name="trash-outline" size={20} color={colors.mut} />
            </Pressable>
          </View>
        ))}
        <View style={{ gap: space.md, marginTop: space.sm }}>
          <Field
            label="Novo evento"
            value={evTitulo}
            onChangeText={setEvTitulo}
            placeholder="Ex.: Samba de roda com DJ"
          />
          <Field
            label="Data e hora"
            value={evData}
            onChangeText={setEvData}
            placeholder="DD/MM/AAAA HH:MM"
            keyboardType="numbers-and-punctuation"
          />
          <Field label="Descrição (opcional)" value={evDesc} onChangeText={setEvDesc} multiline />
          {evErro ? <Txt color={colors.erro}>{evErro}</Txt> : null}
          <Button title="Adicionar à programação" kind="secondary" onPress={adicionarEvento} />
        </View>

        <SectionTitle>Conteúdo oficial</SectionTitle>
        <Txt color={colors.mut}>
          Vídeos que você publica pela aba Publicar aparecem como “Estabelecimento”. Vídeos de frequentadores são
          independentes e não podem ser editados pelo parceiro.
        </Txt>
      </ScrollView>
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

const s = StyleSheet.create({
  grid: { gap: space.sm },
  metric: { padding: space.md, backgroundColor: colors.carvao2, borderRadius: radius.md, gap: 2 },
  event: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    padding: space.md,
    backgroundColor: colors.carvao2,
    borderRadius: radius.md,
    marginBottom: space.sm,
  },
});
