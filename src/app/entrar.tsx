import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { Button, Field, Logo, Screen, Txt } from '@/components/ui';
import { colors, space } from '@/constants/theme';
import { idade, mascaraData, mensagemDeErro, parseDataBR } from '@/lib/format';
import { supabase } from '@/lib/supabase';

const MOTIVOS: Record<string, string> = {
  denunciar: 'Para denunciar, entre na sua conta.',
  salvar: 'Para salvar lugares, entre na sua conta.',
  reivindicar: 'Para reivindicar um estabelecimento, entre na sua conta.',
};

/** Cadastro e autenticação (RF-02): abre por cima e volta para onde a pessoa estava. */
export default function Entrar() {
  const params = useLocalSearchParams<{ motivo?: string; modo?: string }>();
  const [criando, setCriando] = useState(params.modo === 'criar');
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [username, setUsername] = useState('');
  const [nasc, setNasc] = useState('');
  const [termos, setTermos] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const fechar = () => (router.canGoBack() ? router.back() : router.replace('/'));

  async function recuperar() {
    setErro(null);
    if (!email.includes('@')) return setErro('Digite seu e-mail acima para receber o link.');
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim());
    if (error) setErro(mensagemDeErro(error));
    else setAviso('Se existir uma conta com esse e-mail, enviamos um link para criar uma nova senha.');
  }

  async function enviar() {
    setErro(null);
    setAviso(null);
    if (!email.includes('@')) return setErro('Coloca um e-mail válido.');
    if (senha.length < 6) return setErro('A senha precisa ter pelo menos 6 caracteres.');
    setLoading(true);
    try {
      if (!criando) {
        const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password: senha });
        if (error) throw error;
        fechar();
        return;
      }
      const user = username.trim().toLowerCase().replace(/^@/, '');
      if (!/^[a-z0-9_.]{3,24}$/.test(user))
        throw new Error('Seu @ precisa ter de 3 a 24 caracteres: letras minúsculas, números, _ ou .');
      const iso = parseDataBR(nasc);
      if (!iso) throw new Error('Data de nascimento inválida. Use DD/MM/AAAA.');
      if (idade(iso) < 18) throw new Error('O Cola Aqui é para maiores de 18 anos.');
      if (!termos) throw new Error('Para criar a conta, aceite os termos de uso e a política de privacidade.');

      const { data, error } = await supabase.auth.signUp({
        email: email.trim(),
        password: senha,
        options: { data: { username: user, birthdate: iso, terms: 'true' } },
      });
      if (error) throw error;
      if (data.session) fechar();
      else {
        setAviso('Conta criada! Enviamos um link para o seu e-mail. Confirme e depois entre aqui.');
        setCriando(false);
      }
    } catch (e) {
      setErro(mensagemDeErro(e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <Screen edges={['top', 'bottom']}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={s.wrap} keyboardShouldPersistTaps="handled">
          <Pressable onPress={fechar} hitSlop={12} accessibilityLabel="Fechar" style={{ alignSelf: 'flex-end' }}>
            <Ionicons name="close" size={28} color={colors.neblina} />
          </Pressable>

          <View style={{ gap: space.md }}>
            <Logo size={30} />
            <Txt variant="display">
              A cidade acontece.{' '}
              <Txt variant="display" color={colors.pulso}>
                Você faz parte.
              </Txt>
            </Txt>
            {params.motivo && MOTIVOS[params.motivo] ? (
              <Txt color={colors.algodao}>{MOTIVOS[params.motivo]}</Txt>
            ) : null}
          </View>

          <View style={{ gap: space.md }}>
            <Field
              label="E-mail"
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              autoComplete="email"
              keyboardType="email-address"
              placeholder="voce@email.com"
            />
            <Field
              label="Senha"
              value={senha}
              onChangeText={setSenha}
              secureTextEntry
              autoComplete={criando ? 'new-password' : 'current-password'}
              placeholder="mínimo 6 caracteres"
            />
            {criando ? (
              <>
                <Field
                  label="Seu @"
                  value={username}
                  onChangeText={setUsername}
                  autoCapitalize="none"
                  autoCorrect={false}
                  placeholder="ex.: vini.bsb"
                />
                <Field
                  label="Data de nascimento (18+)"
                  value={nasc}
                  onChangeText={(t) => setNasc(mascaraData(t))}
                  keyboardType="number-pad"
                  placeholder="DD/MM/AAAA"
                />
                <Pressable
                  onPress={() => setTermos((t) => !t)}
                  style={s.check}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: termos }}>
                  <Ionicons
                    name={termos ? 'checkbox' : 'square-outline'}
                    size={22}
                    color={termos ? colors.pulso : colors.mut}
                  />
                  <Txt variant="small" style={{ flex: 1 }}>
                    Li e aceito os termos de uso e a política de privacidade.
                  </Txt>
                </Pressable>
              </>
            ) : null}

            {erro ? <Txt color={colors.erro}>{erro}</Txt> : null}
            {aviso ? <Txt color={colors.pulso}>{aviso}</Txt> : null}

            <Button title={criando ? 'Criar conta' : 'Entrar'} onPress={enviar} loading={loading} />
            {!criando ? (
              <Pressable onPress={recuperar} style={{ alignSelf: 'center', padding: space.xs }}>
                <Txt variant="small" color={colors.mut}>
                  Esqueci minha senha
                </Txt>
              </Pressable>
            ) : null}
            <Pressable
              onPress={() => {
                setCriando(!criando);
                setErro(null);
              }}
              style={{ alignSelf: 'center', padding: space.sm }}>
              <Txt variant="label" color={colors.algodao}>
                {criando ? 'Já tenho conta' : 'Criar conta nova'}
              </Txt>
            </Pressable>
            <Pressable onPress={fechar} style={{ alignSelf: 'center', padding: space.xs }}>
              <Txt variant="small" color={colors.mut}>
                Continuar explorando sem conta
              </Txt>
            </Pressable>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const s = StyleSheet.create({
  wrap: { flexGrow: 1, padding: space.lg, gap: space.xl, justifyContent: 'center' },
  check: { flexDirection: 'row', gap: space.sm, alignItems: 'center' },
});
