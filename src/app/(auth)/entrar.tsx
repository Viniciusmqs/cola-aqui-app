import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { Button, Field, Logo, Screen, Txt } from '@/components/ui';
import { colors, space } from '@/constants/theme';
import { idade, mensagemDeErro, parseDataBR } from '@/lib/format';
import { supabase } from '@/lib/supabase';

type Mode = 'entrar' | 'criar';

function mascaraData(txt: string) {
  const d = txt.replace(/\D/g, '').slice(0, 8);
  if (d.length <= 2) return d;
  if (d.length <= 4) return `${d.slice(0, 2)}/${d.slice(2)}`;
  return `${d.slice(0, 2)}/${d.slice(2, 4)}/${d.slice(4)}`;
}

export default function Entrar() {
  const [mode, setMode] = useState<Mode>('entrar');
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [username, setUsername] = useState('');
  const [nasc, setNasc] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function enviar() {
    setErro(null);
    setAviso(null);
    if (!email.includes('@')) return setErro('Coloca um e-mail válido.');
    if (senha.length < 6) return setErro('A senha precisa ter pelo menos 6 caracteres.');

    setLoading(true);
    try {
      if (mode === 'entrar') {
        const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password: senha });
        if (error) throw error;
        return;
      }

      const user = username.trim().toLowerCase().replace(/^@/, '');
      if (!/^[a-z0-9_.]{3,24}$/.test(user)) {
        throw new Error('Seu @ precisa ter de 3 a 24 caracteres: letras minúsculas, números, _ ou .');
      }
      const iso = parseDataBR(nasc);
      if (!iso) throw new Error('Data de nascimento inválida. Use DD/MM/AAAA.');
      if (idade(iso) < 18) throw new Error('O Cola Aqui é só para maiores de 18 anos.');

      const { data, error } = await supabase.auth.signUp({
        email: email.trim(),
        password: senha,
        options: { data: { username: user, nascimento: iso } },
      });
      if (error) throw error;
      if (!data.session) {
        setAviso('Conta criada! Enviamos um link para o seu e-mail. Confirme e depois entre aqui.');
        setMode('entrar');
      }
    } catch (e) {
      setErro(mensagemDeErro(e));
    } finally {
      setLoading(false);
    }
  }

  const criando = mode === 'criar';

  return (
    <Screen edges={['top', 'bottom']}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={s.wrap} keyboardShouldPersistTaps="handled">
          <View style={{ gap: space.md }}>
            <Logo size={34} />
            <Txt variant="display">
              O que tá rolando <Txt variant="display" color={colors.pulso}>agora</Txt> em Brasília.
            </Txt>
            <Txt color={colors.mut}>Vídeos de quem tá lá, com hora marcada. Sem foto de três meses atrás.</Txt>
          </View>

          <View style={s.form}>
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
              </>
            ) : null}

            {erro ? <Txt color={colors.erro}>{erro}</Txt> : null}
            {aviso ? <Txt color={colors.pulso}>{aviso}</Txt> : null}

            <Button title={criando ? 'Criar conta' : 'Entrar'} onPress={enviar} loading={loading} />
            <Pressable
              onPress={() => {
                setMode(criando ? 'entrar' : 'criar');
                setErro(null);
              }}
              style={{ alignSelf: 'center', padding: space.sm }}>
              <Txt variant="label" color={colors.algodao}>
                {criando ? 'Já tenho conta' : 'Criar conta nova'}
              </Txt>
            </Pressable>
            {criando ? (
              <Txt variant="small" color={colors.mut} style={{ textAlign: 'center' }}>
                Ao criar a conta você confirma que tem 18 anos ou mais e aceita os termos de uso e a política de
                privacidade.
              </Txt>
            ) : null}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const s = StyleSheet.create({
  wrap: { flexGrow: 1, padding: space.lg, gap: space.xl, justifyContent: 'center' },
  form: { gap: space.md },
});
