import Ionicons from '@expo/vector-icons/Ionicons';
import { Link, router } from 'expo-router';
import { useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { Button, LoginGate, Screen, SectionTitle, Txt } from '@/components/ui';
import { colors, radius, space } from '@/constants/theme';
import { useAuth } from '@/lib/auth';
import { mensagemDeErro, tempoDesde } from '@/lib/format';
import { useMyPlaces, useMyPosts, useMyProfile } from '@/lib/queries';
import { supabase } from '@/lib/supabase';
import type { PostStatus } from '@/lib/types';

type MyPost = {
  id: string;
  status: PostStatus;
  created_at: string;
  published_at: string | null;
  moderation_note: string | null;
  place: { id: string; name: string } | null;
};

const STATUS: Record<PostStatus, { label: string; color: string }> = {
  pending_review: { label: 'Em análise', color: colors.algodao },
  published: { label: 'Publicado', color: colors.pulso },
  rejected: { label: 'Não aprovado', color: colors.rosa },
  hidden: { label: 'Oculto', color: colors.mut },
  removed: { label: 'Removido', color: colors.mut },
};

export default function Perfil() {
  const { session } = useAuth();
  const me = useMyProfile();
  const posts = useMyPosts();
  const places = useMyPlaces();
  const [saindo, setSaindo] = useState(false);

  if (!session) {
    return (
      <LoginGate title="Seu perfil" text="Entre para publicar vídeos, salvar lugares e acompanhar suas publicações." />
    );
  }

  const rows = (posts.data ?? []) as unknown as MyPost[];
  const moderador = me.data?.role === 'moderator' || me.data?.role === 'admin';

  function pedirExclusao() {
    Alert.alert(
      'Excluir conta',
      'Vamos excluir sua conta e seus dados pessoais. Suas publicações deixam de aparecer. Isso não pode ser desfeito.',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Solicitar exclusão',
          style: 'destructive',
          onPress: async () => {
            const { error } = await supabase.rpc('request_account_deletion');
            if (error) Alert.alert('Não deu certo', mensagemDeErro(error));
            else {
              Alert.alert('Pedido recebido', 'Vamos excluir sua conta e avisar pelo seu e-mail. Você vai sair agora.');
              await supabase.auth.signOut();
            }
          },
        },
      ],
    );
  }

  return (
    <Screen>
      <ScrollView contentContainerStyle={{ padding: space.md, paddingBottom: space.xxl }}>
        <View style={s.head}>
          <View style={s.avatar}>
            <Txt variant="title" color={colors.carvao}>
              {(me.data?.username ?? '?').slice(0, 1).toUpperCase()}
            </Txt>
          </View>
          <View style={{ flex: 1 }}>
            <Txt variant="title">@{me.data?.username ?? '…'}</Txt>
            {me.data?.role === 'creator' ? (
              <Txt variant="small" color={colors.violeta}>
                Criador
              </Txt>
            ) : null}
          </View>
        </View>

        {moderador ? (
          <MenuItem
            icon="shield-checkmark-outline"
            label="Moderação"
            hint="Publicações, denúncias e reivindicações"
            onPress={() => router.push('/moderacao')}
          />
        ) : null}

        {(places.data ?? []).length > 0 ? (
          <>
            <SectionTitle>Cola Parceiros</SectionTitle>
            {(places.data ?? []).map((p) => (
              <MenuItem
                key={p.id as string}
                icon="storefront-outline"
                label={p.name as string}
                hint="Dados oficiais, programação e métricas"
                onPress={() => router.push({ pathname: '/parceiro/[id]', params: { id: p.id as string } })}
              />
            ))}
          </>
        ) : null}

        <SectionTitle>Minhas publicações</SectionTitle>
        {rows.length === 0 && !posts.isLoading ? (
          <Txt color={colors.mut}>Você ainda não publicou. Quando estiver num lugar, mostre como ele está.</Txt>
        ) : null}
        <View style={{ gap: space.sm }}>
          {rows.map((p) => (
            <Link key={p.id} href={p.place ? { pathname: '/lugar/[id]', params: { id: p.place.id } } : '/'} asChild>
              <Pressable style={s.row} accessibilityRole="link">
                <View style={{ flex: 1 }}>
                  <Txt variant="label">{p.place?.name ?? 'Lugar'}</Txt>
                  <Txt variant="small" color={colors.mut}>
                    {p.published_at ? `Publicado ${tempoDesde(p.published_at)}` : `Enviado ${tempoDesde(p.created_at)}`}
                  </Txt>
                  {p.status === 'rejected' && p.moderation_note ? (
                    <Txt variant="small" color={colors.mut}>
                      Motivo: {p.moderation_note}
                    </Txt>
                  ) : null}
                </View>
                <View style={[s.status, { borderColor: STATUS[p.status].color }]}>
                  <Txt variant="caption" color={STATUS[p.status].color}>
                    {STATUS[p.status].label}
                  </Txt>
                </View>
              </Pressable>
            </Link>
          ))}
        </View>

        <SectionTitle>Conta</SectionTitle>
        <MenuItem icon="trash-outline" label="Solicitar exclusão da conta" onPress={pedirExclusao} />
        <Button
          title="Sair"
          kind="ghost"
          loading={saindo}
          style={{ marginTop: space.lg }}
          onPress={async () => {
            setSaindo(true);
            await supabase.auth.signOut();
            setSaindo(false);
          }}
        />
      </ScrollView>
    </Screen>
  );
}

function MenuItem({
  icon,
  label,
  hint,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  hint?: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [s.row, { marginBottom: space.sm }, pressed && { opacity: 0.8 }]}
      accessibilityRole="button">
      <Ionicons name={icon} size={22} color={colors.pulso} />
      <View style={{ flex: 1 }}>
        <Txt variant="label">{label}</Txt>
        {hint ? (
          <Txt variant="small" color={colors.mut}>
            {hint}
          </Txt>
        ) : null}
      </View>
      <Ionicons name="chevron-forward" size={18} color={colors.mut} />
    </Pressable>
  );
}

const s = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', gap: space.md, marginBottom: space.lg },
  avatar: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: colors.pulso,
    alignItems: 'center',
    justifyContent: 'center',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    padding: space.md,
    backgroundColor: colors.carvao2,
    borderRadius: radius.md,
  },
  status: { borderWidth: 1, borderRadius: radius.pill, paddingHorizontal: 8, paddingVertical: 3 },
});
