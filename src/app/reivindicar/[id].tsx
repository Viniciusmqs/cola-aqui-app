import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, View } from 'react-native';

import { Button, Empty, Field, LoginGate, Screen, Txt } from '@/components/ui';
import { colors, space } from '@/constants/theme';
import { useAuth } from '@/lib/auth';
import { mensagemDeErro } from '@/lib/format';
import { usePlace } from '@/lib/queries';
import { supabase } from '@/lib/supabase';

/** Reivindicar estabelecimento (RF-11, QA-07): só vale depois da aprovação da equipe. */
export default function Reivindicar() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { session } = useAuth();
  const place = usePlace(id);
  const [org, setOrg] = useState('');
  const [contato, setContato] = useState('');
  const [prova, setProva] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [enviado, setEnviado] = useState(false);
  const fechar = () => (router.canGoBack() ? router.back() : router.replace('/'));

  if (!session)
    return <LoginGate title="Reivindicar lugar" text="Entre na sua conta para pedir o controle deste perfil." />;

  if (enviado) {
    return (
      <Screen style={{ justifyContent: 'center' }}>
        <Empty
          title="Pedido enviado"
          text="Nossa equipe vai verificar o vínculo e falar com você pelo contato informado. Até a aprovação, nada muda no perfil."
          action={<Button title="Voltar ao lugar" onPress={fechar} />}
        />
      </Screen>
    );
  }

  async function enviar() {
    setErro(null);
    if (org.trim().length < 2) return setErro('Informe o nome da empresa ou responsável.');
    if (contato.trim().length < 6) return setErro('Informe um e-mail ou WhatsApp para contato.');
    setLoading(true);
    const { error } = await supabase.rpc('claim_place', {
      p_place: id,
      p_org_name: org,
      p_contact: contato,
      p_evidence: prova,
    });
    setLoading(false);
    if (error) setErro(mensagemDeErro(error));
    else setEnviado(true);
  }

  return (
    <Screen edges={['top', 'bottom']}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={{ padding: space.lg, gap: space.md }} keyboardShouldPersistTaps="handled">
          <Pressable onPress={fechar} hitSlop={12} accessibilityLabel="Fechar" style={{ alignSelf: 'flex-end' }}>
            <Ionicons name="close" size={28} color={colors.neblina} />
          </Pressable>
          <Txt variant="title">Reivindicar {place.data?.name ?? 'lugar'}</Txt>
          <Txt color={colors.mut}>
            Com o perfil aprovado, você atualiza endereço, horários e programação, publica conteúdo oficial identificado
            e acompanha as métricas do lugar. Vídeos de frequentadores continuam independentes.
          </Txt>
          <Field label="Empresa ou responsável" value={org} onChangeText={setOrg} placeholder="Razão social ou nome" />
          <Field
            label="Contato"
            value={contato}
            onChangeText={setContato}
            placeholder="E-mail ou WhatsApp"
            autoCapitalize="none"
          />
          <Field
            label="Como comprovar o vínculo (opcional)"
            value={prova}
            onChangeText={setProva}
            placeholder="CNPJ, cargo, @ oficial do lugar…"
            multiline
          />
          {erro ? <Txt color={colors.erro}>{erro}</Txt> : null}
          <View style={{ marginTop: space.sm }}>
            <Button title="Enviar pedido" onPress={enviar} loading={loading} />
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}
