import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';

import { Button, Field, Logo, Screen, Txt } from '@/components/ui';
import { colors, fonts, radius, space } from '@/constants/theme';
import { idade, mascaraData, mensagemDeErro, parseDataBR } from '@/lib/format';
import { supabase } from '@/lib/supabase';

const MOTIVOS: Record<string, string> = {
  denunciar: 'Para denunciar, entre na sua conta.',
  salvar: 'Para salvar lugares, entre na sua conta.',
  reivindicar: 'Para reivindicar um estabelecimento, entre na sua conta.',
};

/** Código de confirmação por e-mail: digitado no app, sem link (link de e-mail não abre o app no celular). */
type Codigo = { email: string; tipo: 'signup' | 'recovery' };

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
  const [codigo, setCodigo] = useState<Codigo | null>(null);
  const [naoConfirmado, setNaoConfirmado] = useState(false);

  const fechar = () => (router.canGoBack() ? router.back() : router.replace('/'));

  async function recuperar() {
    setErro(null);
    if (!email.includes('@')) return setErro('Digite seu e-mail acima para receber o código.');
    setLoading(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim());
    setLoading(false);
    if (error) return setErro(mensagemDeErro(error));
    setCodigo({ email: email.trim(), tipo: 'recovery' });
  }

  async function confirmarDepois() {
    setErro(null);
    setLoading(true);
    const { error } = await supabase.auth.resend({ type: 'signup', email: email.trim() });
    setLoading(false);
    if (error) return setErro(mensagemDeErro(error));
    setCodigo({ email: email.trim(), tipo: 'signup' });
  }

  if (codigo) {
    return <ConfirmarCodigo codigo={codigo} onVoltar={() => setCodigo(null)} onPronto={fechar} />;
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
        if (error) {
          // conta criada mas ainda sem código confirmado: oferece mandar o código de novo
          if (/Email not confirmed/i.test(error.message)) setNaoConfirmado(true);
          throw error;
        }
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
      else setCodigo({ email: email.trim(), tipo: 'signup' });
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
            {naoConfirmado && !criando ? (
              <Button
                title="Receber código de confirmação"
                kind="secondary"
                onPress={confirmarDepois}
                loading={loading}
              />
            ) : null}

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
                setNaoConfirmado(false);
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

const ESPERA_REENVIO_S = 60;

/**
 * Tela do código (6 dígitos) que chega por e-mail. O teclado do iPhone/Android sugere o código
 * sozinho (oneTimeCode). Confirmado, a pessoa já entra; na recuperação, cria a senha nova aqui mesmo.
 */
function ConfirmarCodigo({
  codigo,
  onVoltar,
  onPronto,
}: {
  codigo: Codigo;
  onVoltar: () => void;
  onPronto: () => void;
}) {
  const [token, setToken] = useState('');
  const [senhaNova, setSenhaNova] = useState('');
  const [etapa, setEtapa] = useState<'codigo' | 'senha'>('codigo');
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [espera, setEspera] = useState(ESPERA_REENVIO_S);
  const enviando = useRef(false);

  useEffect(() => {
    if (espera <= 0) return;
    const t = setTimeout(() => setEspera((x) => x - 1), 1000);
    return () => clearTimeout(t);
  }, [espera]);

  async function verificar(valor: string) {
    if (enviando.current) return;
    if (!/^\d{6,8}$/.test(valor)) return setErro('Digite o código de 6 dígitos do e-mail.');
    enviando.current = true;
    setErro(null);
    setLoading(true);
    const { error } = await supabase.auth.verifyOtp({ email: codigo.email, token: valor, type: codigo.tipo });
    setLoading(false);
    enviando.current = false;
    if (error) {
      setToken('');
      return setErro(mensagemDeErro(error));
    }
    if (codigo.tipo === 'recovery') setEtapa('senha');
    else onPronto();
  }

  async function reenviar() {
    setErro(null);
    setAviso(null);
    const { error } =
      codigo.tipo === 'signup'
        ? await supabase.auth.resend({ type: 'signup', email: codigo.email })
        : await supabase.auth.resetPasswordForEmail(codigo.email);
    if (error) return setErro(mensagemDeErro(error));
    setEspera(ESPERA_REENVIO_S);
    setAviso('Enviamos um código novo. Use o mais recente.');
  }

  async function salvarSenha() {
    if (senhaNova.length < 6) return setErro('A senha precisa ter pelo menos 6 caracteres.');
    setLoading(true);
    const { error } = await supabase.auth.updateUser({ password: senhaNova });
    setLoading(false);
    if (error) return setErro(mensagemDeErro(error));
    onPronto();
  }

  return (
    <Screen edges={['top', 'bottom']}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={s.wrap} keyboardShouldPersistTaps="handled">
          <Pressable onPress={onVoltar} hitSlop={12} accessibilityLabel="Voltar" style={{ alignSelf: 'flex-start' }}>
            <Ionicons name="chevron-back" size={28} color={colors.neblina} />
          </Pressable>
          {etapa === 'codigo' ? (
            <View style={{ gap: space.md }}>
              <Logo size={26} />
              <Txt variant="display">{codigo.tipo === 'signup' ? 'Confirme seu e-mail' : 'Criar nova senha'}</Txt>
              <Txt color={colors.mut}>
                Enviamos um código de 6 dígitos para <Txt color={colors.neblina}>{codigo.email}</Txt>. Ele vale por 1
                hora. Confira também o spam.
              </Txt>
              <TextInput
                value={token}
                onChangeText={(t) => {
                  const v = t.replace(/\D/g, '').slice(0, 8);
                  setToken(v);
                  if (v.length === 6) verificar(v);
                }}
                keyboardType="number-pad"
                textContentType="oneTimeCode"
                autoComplete="one-time-code"
                autoFocus
                maxLength={8}
                placeholder="000000"
                placeholderTextColor={colors.carvao3}
                selectionColor={colors.pulso}
                style={s.otp}
                accessibilityLabel="Código de confirmação"
              />
              {erro ? <Txt color={colors.erro}>{erro}</Txt> : null}
              {aviso ? <Txt color={colors.pulso}>{aviso}</Txt> : null}
              <Button title="Confirmar" onPress={() => verificar(token)} loading={loading} />
              <Pressable
                onPress={reenviar}
                disabled={espera > 0}
                style={{ alignSelf: 'center', padding: space.sm }}
                accessibilityRole="button">
                <Txt variant="label" color={espera > 0 ? colors.mut : colors.algodao}>
                  {espera > 0 ? `Reenviar código em ${espera}s` : 'Reenviar código'}
                </Txt>
              </Pressable>
              <Pressable onPress={onVoltar} style={{ alignSelf: 'center', padding: space.xs }}>
                <Txt variant="small" color={colors.mut}>
                  Corrigir o e-mail
                </Txt>
              </Pressable>
            </View>
          ) : (
            <View style={{ gap: space.md }}>
              <Logo size={26} />
              <Txt variant="display">Sua nova senha</Txt>
              <Field
                label="Nova senha"
                value={senhaNova}
                onChangeText={setSenhaNova}
                secureTextEntry
                autoComplete="new-password"
                placeholder="mínimo 6 caracteres"
              />
              {erro ? <Txt color={colors.erro}>{erro}</Txt> : null}
              <Button title="Salvar e entrar" onPress={salvarSenha} loading={loading} />
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const s = StyleSheet.create({
  otp: {
    minHeight: 68,
    borderRadius: radius.md,
    backgroundColor: colors.carvao2,
    borderWidth: 1,
    borderColor: colors.carvao3,
    color: colors.neblina,
    fontFamily: fonts.bold,
    fontSize: 32,
    letterSpacing: 10,
    textAlign: 'center',
  },
  wrap: { flexGrow: 1, padding: space.lg, gap: space.xl, justifyContent: 'center' },
  check: { flexDirection: 'row', gap: space.sm, alignItems: 'center' },
});
