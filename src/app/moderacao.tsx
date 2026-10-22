import Ionicons from '@expo/vector-icons/Ionicons';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useState } from 'react';
import { Alert, FlatList, Pressable, StyleSheet, View } from 'react-native';

import { PostVideo } from '@/components/post-card';
import { Button, Chip, Empty, Screen, Txt } from '@/components/ui';
import { colors, radius, space } from '@/constants/theme';
import { mensagemDeErro, tempoDesde } from '@/lib/format';
import { useMyProfile } from '@/lib/queries';
import { signedUrls, supabase } from '@/lib/supabase';

type Aba = 'posts' | 'denuncias' | 'reivindicacoes';

/** Fila de moderação (RF-12, RF-11): toda decisão fica registrada no banco. */
export default function Moderacao() {
  const me = useMyProfile();
  const [aba, setAba] = useState<Aba>('posts');
  const moderador = me.data?.role === 'moderator' || me.data?.role === 'admin';

  return (
    <Screen>
      <View style={s.top}>
        <Pressable
          onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}
          hitSlop={12}
          accessibilityLabel="Voltar">
          <Ionicons name="chevron-back" size={28} color={colors.neblina} />
        </Pressable>
        <Txt variant="title">Moderação</Txt>
      </View>
      {!moderador ? (
        me.isLoading ? null : (
          <Empty title="Sem acesso" text="Área restrita à equipe de moderação." />
        )
      ) : (
        <>
          <View style={s.tabs}>
            <Chip label="Publicações" active={aba === 'posts'} onPress={() => setAba('posts')} />
            <Chip label="Denúncias" active={aba === 'denuncias'} onPress={() => setAba('denuncias')} />
            <Chip label="Reivindicações" active={aba === 'reivindicacoes'} onPress={() => setAba('reivindicacoes')} />
          </View>
          {aba === 'posts' ? <FilaPosts /> : aba === 'denuncias' ? <FilaDenuncias /> : <FilaReivindicacoes />}
        </>
      )}
    </Screen>
  );
}

type PendingPost = {
  id: string;
  caption: string | null;
  origin: string;
  created_at: string;
  place: { name: string } | null;
  author: { username: string } | null;
  media: { path: string } | null;
  media_url?: string | null;
};

function FilaPosts() {
  const qc = useQueryClient();
  const [tocando, setTocando] = useState<string | null>(null);
  const q = useQuery({
    queryKey: ['mod-posts'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('posts')
        .select(
          'id, caption, origin, created_at, place:places(name), author:profiles!posts_author_fkey(username), media:media_assets(path)',
        )
        .eq('status', 'pending_review')
        .order('created_at')
        .limit(30);
      if (error) throw error;
      const rows = (data ?? []) as unknown as PendingPost[];
      const urls = await signedUrls(rows.map((r) => r.media?.path).filter(Boolean) as string[]);
      return rows.map((r) => ({ ...r, media_url: r.media ? (urls.get(r.media.path) ?? null) : null }));
    },
    refetchInterval: 30_000,
  });

  async function decidir(id: string, action: 'approve' | 'reject', reason?: string) {
    const { error } = await supabase.rpc('moderate_post', { p_post: id, p_action: action, p_reason: reason ?? null });
    if (error) Alert.alert('Erro', mensagemDeErro(error));
    qc.invalidateQueries({ queryKey: ['mod-posts'] });
    qc.invalidateQueries({ queryKey: ['feed'] });
  }

  function recusar(id: string) {
    Alert.alert('Recusar publicação', 'Qual o motivo?', [
      { text: 'Não é do lugar', onPress: () => decidir(id, 'reject', 'Não mostra o lugar escolhido') },
      { text: 'Expõe pessoas', onPress: () => decidir(id, 'reject', 'Expõe pessoas sem consentimento ou menores') },
      { text: 'Inadequado', onPress: () => decidir(id, 'reject', 'Conteúdo inadequado') },
    ]);
  }

  return (
    <FlatList
      contentContainerStyle={{ padding: space.md, gap: space.md }}
      data={q.data ?? []}
      keyExtractor={(p) => p.id}
      renderItem={({ item }) => (
        <View style={s.card}>
          <Pressable style={s.video} onPress={() => setTocando(tocando === item.id ? null : item.id)}>
            {item.media_url ? <PostVideo uri={item.media_url} playing={tocando === item.id} postId={item.id} /> : null}
            {tocando !== item.id ? (
              <View style={s.play}>
                <Ionicons name="play" size={28} color={colors.neblina} />
              </View>
            ) : null}
          </Pressable>
          <View style={{ padding: space.md, gap: 4 }}>
            <Txt variant="label">{item.place?.name}</Txt>
            <Txt variant="small" color={colors.mut}>
              @{item.author?.username} · {item.origin} · enviado {tempoDesde(item.created_at)}
            </Txt>
            {item.caption ? <Txt>{item.caption}</Txt> : null}
            <View style={{ flexDirection: 'row', gap: space.sm, marginTop: space.sm }}>
              <Button title="Recusar" kind="ghost" style={{ flex: 1 }} onPress={() => recusar(item.id)} />
              <Button title="Aprovar" style={{ flex: 1 }} onPress={() => decidir(item.id, 'approve')} />
            </View>
          </View>
        </View>
      )}
      ListEmptyComponent={
        q.isLoading ? undefined : <Empty title="Fila vazia" text="Nenhuma publicação esperando análise." />
      }
    />
  );
}

type OpenReport = {
  id: string;
  reason: string;
  details: string | null;
  created_at: string;
  post_id: string | null;
  place_id: string | null;
  place: { name: string } | null;
  post: { caption: string | null; status: string; place: { name: string } | null } | null;
};

function FilaDenuncias() {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ['mod-reports'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('reports')
        .select(
          'id, reason, details, created_at, post_id, place_id, place:places(name), post:posts(caption, status, place:places(name))',
        )
        .eq('status', 'open')
        .order('created_at')
        .limit(50);
      if (error) throw error;
      return (data ?? []) as unknown as OpenReport[];
    },
  });

  async function remover(r: OpenReport) {
    if (!r.post_id) return;
    const { error } = await supabase.rpc('moderate_post', {
      p_post: r.post_id,
      p_action: 'remove',
      p_reason: r.reason,
    });
    if (error) Alert.alert('Erro', mensagemDeErro(error));
    qc.invalidateQueries({ queryKey: ['mod-reports'] });
  }
  async function descartar(r: OpenReport) {
    const { error } = await supabase.rpc('dismiss_reports', { p_post: r.post_id, p_place: r.place_id });
    if (error) Alert.alert('Erro', mensagemDeErro(error));
    qc.invalidateQueries({ queryKey: ['mod-reports'] });
  }

  return (
    <FlatList
      contentContainerStyle={{ padding: space.md, gap: space.sm }}
      data={q.data ?? []}
      keyExtractor={(r) => r.id}
      renderItem={({ item }) => (
        <View style={[s.card, { padding: space.md, gap: 4 }]}>
          <Txt variant="label">
            {item.post ? `Vídeo em ${item.post.place?.name ?? 'lugar'}` : `Lugar: ${item.place?.name}`}
          </Txt>
          <Txt variant="small" color={colors.rosa}>
            Motivo: {item.reason}
          </Txt>
          {item.post?.caption ? <Txt variant="small">“{item.post.caption}”</Txt> : null}
          <Txt variant="caption" color={colors.mut}>
            {tempoDesde(item.created_at)}
            {item.post ? ` · status do vídeo: ${item.post.status}` : ''}
          </Txt>
          <View style={{ flexDirection: 'row', gap: space.sm, marginTop: space.sm }}>
            <Button title="Descartar" kind="ghost" style={{ flex: 1 }} onPress={() => descartar(item)} />
            {item.post_id ? (
              <Button title="Remover vídeo" kind="rosa" style={{ flex: 1 }} onPress={() => remover(item)} />
            ) : null}
          </View>
        </View>
      )}
      ListEmptyComponent={q.isLoading ? undefined : <Empty title="Sem denúncias abertas" text="Tudo certo por aqui." />}
    />
  );
}

type Claim = {
  id: string;
  org_name: string;
  contact: string;
  evidence: string | null;
  created_at: string;
  place: { id: string; name: string } | null;
  user: { username: string } | null;
};

function FilaReivindicacoes() {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ['mod-claims'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('place_claims')
        .select(
          'id, org_name, contact, evidence, created_at, place:places(id, name), user:profiles!place_claims_user_id_fkey(username)',
        )
        .eq('status', 'pending')
        .order('created_at');
      if (error) throw error;
      return (data ?? []) as unknown as Claim[];
    },
  });

  async function decidir(id: string, aprovar: boolean) {
    const { error } = await supabase.rpc('decide_claim', { p_claim: id, p_approve: aprovar, p_note: null });
    if (error) Alert.alert('Erro', mensagemDeErro(error));
    qc.invalidateQueries({ queryKey: ['mod-claims'] });
  }

  return (
    <FlatList
      contentContainerStyle={{ padding: space.md, gap: space.sm }}
      data={q.data ?? []}
      keyExtractor={(c) => c.id}
      renderItem={({ item }) => (
        <View style={[s.card, { padding: space.md, gap: 4 }]}>
          <Txt variant="label">{item.place?.name}</Txt>
          <Txt variant="small">
            {item.org_name} · @{item.user?.username}
          </Txt>
          <Txt variant="small" color={colors.mut}>
            Contato: {item.contact}
          </Txt>
          {item.evidence ? (
            <Txt variant="small" color={colors.mut}>
              Comprovação: {item.evidence}
            </Txt>
          ) : null}
          <Txt variant="caption" color={colors.mut}>
            {tempoDesde(item.created_at)} · confirme o vínculo pelo contato antes de aprovar
          </Txt>
          <View style={{ flexDirection: 'row', gap: space.sm, marginTop: space.sm }}>
            <Button title="Recusar" kind="ghost" style={{ flex: 1 }} onPress={() => decidir(item.id, false)} />
            <Button title="Aprovar" style={{ flex: 1 }} onPress={() => decidir(item.id, true)} />
          </View>
        </View>
      )}
      ListEmptyComponent={
        q.isLoading ? undefined : <Empty title="Nenhum pedido" text="Sem reivindicações pendentes." />
      }
    />
  );
}

const s = StyleSheet.create({
  top: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    paddingHorizontal: space.sm,
    paddingVertical: space.xs,
  },
  tabs: { flexDirection: 'row', gap: space.sm, paddingHorizontal: space.md, paddingBottom: space.sm },
  card: { backgroundColor: colors.carvao2, borderRadius: radius.lg, overflow: 'hidden' },
  video: { aspectRatio: 9 / 12, backgroundColor: '#0E1513', alignItems: 'center', justifyContent: 'center' },
  play: { position: 'absolute', backgroundColor: 'rgba(23,33,31,0.7)', borderRadius: 30, padding: 14 },
});
