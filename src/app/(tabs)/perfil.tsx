import { useState } from 'react';
import { FlatList, StyleSheet, View } from 'react-native';

import { Button, Screen, Txt } from '@/components/ui';
import { colors, radius, space } from '@/constants/theme';
import { haQuanto } from '@/lib/format';
import { useMyPosts, useMyProfile } from '@/lib/queries';
import { supabase } from '@/lib/supabase';

type MyPost = {
  id: string;
  created_at: string;
  expira_em: string;
  status: string;
  place: { nome: string } | { nome: string }[] | null;
};

const placeName = (p: MyPost['place']) => (Array.isArray(p) ? p[0]?.nome : p?.nome) ?? 'Lugar';

export default function Perfil() {
  const me = useMyProfile();
  const posts = useMyPosts();
  const [agora] = useState(() => Date.now());

  return (
    <Screen>
      <FlatList
        contentContainerStyle={{ padding: space.md, gap: space.sm }}
        data={(posts.data ?? []) as MyPost[]}
        keyExtractor={(p) => p.id}
        ListHeaderComponent={
          <View style={{ gap: space.md, marginBottom: space.md }}>
            <View style={s.avatar}>
              <Txt variant="title" color={colors.carvao}>
                {(me.data?.username ?? '?').slice(0, 1).toUpperCase()}
              </Txt>
            </View>
            <View>
              <Txt variant="title">@{me.data?.username ?? '…'}</Txt>
              {me.data?.nome ? <Txt color={colors.mut}>{me.data.nome}</Txt> : null}
            </View>
            <Txt variant="label" style={{ marginTop: space.md }}>
              Seus registros
            </Txt>
          </View>
        }
        renderItem={({ item }) => {
          const noAr = item.status === 'publicado' && new Date(item.expira_em).getTime() > agora;
          return (
            <View style={s.row}>
              <View style={{ flex: 1 }}>
                <Txt variant="label">{placeName(item.place)}</Txt>
                <Txt variant="small" color={colors.mut}>
                  {haQuanto(item.created_at)}
                </Txt>
              </View>
              <Txt variant="caption" color={noAr ? colors.pulso : colors.mut}>
                {noAr ? 'no feed' : item.status === 'oculto' ? 'oculto' : 'expirou'}
              </Txt>
            </View>
          );
        }}
        ListEmptyComponent={
          posts.isLoading ? undefined : (
            <Txt color={colors.mut}>Você ainda não postou. Quando chegar num rolê, mostra como tá.</Txt>
          )
        }
        ListFooterComponent={
          <Button
            title="Sair"
            kind="ghost"
            style={{ marginTop: space.xl }}
            onPress={() => supabase.auth.signOut()}
          />
        }
      />
    </Screen>
  );
}

const s = StyleSheet.create({
  avatar: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: colors.pulso,
    alignItems: 'center',
    justifyContent: 'center',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: space.md,
    backgroundColor: colors.carvao2,
    borderRadius: radius.md,
  },
});
