import type { ReactNode } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type PressableProps,
  type StyleProp,
  type TextInputProps,
  type TextProps,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { router } from 'expo-router';

import { colors, fonts, radius, space } from '@/constants/theme';
import { rotuloPublicacao } from '@/lib/format';
import type { PostOrigin } from '@/lib/types';

type Variant = 'display' | 'title' | 'body' | 'label' | 'small' | 'caption';

export function Txt({
  variant = 'body',
  color = colors.neblina,
  style,
  ...rest
}: TextProps & { variant?: Variant; color?: string; style?: StyleProp<TextStyle> }) {
  return <Text {...rest} style={[t[variant], { color }, style]} />;
}

const t = StyleSheet.create({
  display: { fontFamily: fonts.display, fontSize: 40, lineHeight: 42, letterSpacing: -1 },
  title: { fontFamily: fonts.display, fontSize: 24, lineHeight: 28, letterSpacing: -0.5 },
  body: { fontFamily: fonts.regular, fontSize: 16, lineHeight: 22 },
  label: { fontFamily: fonts.semibold, fontSize: 15, lineHeight: 20 },
  small: { fontFamily: fonts.medium, fontSize: 13, lineHeight: 18 },
  caption: { fontFamily: fonts.medium, fontSize: 11, lineHeight: 14, letterSpacing: 0.4 },
});

export function Screen({
  children,
  style,
  edges = ['top'],
}: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  edges?: ('top' | 'bottom' | 'left' | 'right')[];
}) {
  return (
    <SafeAreaView edges={edges} style={[{ flex: 1, backgroundColor: colors.carvao }, style]}>
      {children}
    </SafeAreaView>
  );
}

export function Logo({ size = 28 }: { size?: number }) {
  return (
    <Txt variant="title" style={{ fontSize: size, lineHeight: size * 1.05 }}>
      cola
      <Txt variant="title" color={colors.pulso} style={{ fontSize: size, lineHeight: size * 1.05 }}>
        {' '}
        aqui
      </Txt>
    </Txt>
  );
}

type ButtonProps = Omit<PressableProps, 'style'> & {
  title: string;
  kind?: 'primary' | 'secondary' | 'ghost' | 'rosa';
  loading?: boolean;
  style?: StyleProp<ViewStyle>;
  icon?: ReactNode;
};

export function Button({ title, kind = 'primary', loading, disabled, style, icon, ...rest }: ButtonProps) {
  const bg = {
    primary: colors.pulso,
    rosa: colors.rosa,
    secondary: colors.carvao2,
    ghost: 'transparent',
  }[kind];
  const fg = kind === 'primary' ? colors.carvao : colors.neblina;
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled || loading}
      style={({ pressed }) => [
        b.base,
        { backgroundColor: bg, opacity: disabled ? 0.45 : pressed ? 0.8 : 1 },
        kind === 'ghost' && b.ghost,
        style,
      ]}
      {...rest}>
      {loading ? (
        <ActivityIndicator color={fg} />
      ) : (
        <View style={b.row}>
          {icon}
          <Txt variant="label" color={fg}>
            {title}
          </Txt>
        </View>
      )}
    </Pressable>
  );
}

const b = StyleSheet.create({
  base: {
    minHeight: 52,
    borderRadius: radius.pill,
    paddingHorizontal: space.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ghost: { borderWidth: 1, borderColor: colors.carvao3 },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
});

export function Field({ label, error, ...rest }: TextInputProps & { label: string; error?: string | null }) {
  return (
    <View style={{ gap: 6 }}>
      <Txt variant="small" color={colors.mut}>
        {label}
      </Txt>
      <TextInput
        placeholderTextColor={colors.mut}
        selectionColor={colors.pulso}
        style={[f.input, error ? { borderColor: colors.erro } : null]}
        {...rest}
      />
      {error ? (
        <Txt variant="small" color={colors.erro}>
          {error}
        </Txt>
      ) : null}
    </View>
  );
}

const f = StyleSheet.create({
  input: {
    minHeight: 52,
    borderRadius: radius.md,
    backgroundColor: colors.carvao2,
    borderWidth: 1,
    borderColor: colors.carvao3,
    paddingHorizontal: space.md,
    color: colors.neblina,
    fontFamily: fonts.regular,
    fontSize: 16,
  },
});

export function Chip({
  label,
  active,
  onPress,
  tone = 'pulso',
}: {
  label: string;
  active?: boolean;
  onPress?: () => void;
  tone?: 'pulso' | 'rosa';
}) {
  const on = tone === 'pulso' ? colors.pulso : colors.rosa;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: !!active }}
      style={[c.chip, active ? { backgroundColor: on, borderColor: on } : null]}>
      <Txt variant="small" color={active ? colors.carvao : colors.neblina}>
        {label}
      </Txt>
    </Pressable>
  );
}

const c = StyleSheet.create({
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.carvao3,
    backgroundColor: colors.carvao2,
  },
});

/** "Publicado há 8 min · Usuário" + selo de patrocínio quando houver (PRD 5.1, 5.3). */
export function PublishedTag({
  publishedAt,
  origin,
  sponsored,
  fresh,
}: {
  publishedAt: string;
  origin: PostOrigin;
  sponsored?: boolean;
  fresh?: boolean;
}) {
  return (
    <View style={o.row}>
      <View style={o.tag}>
        <View style={[o.dot, { backgroundColor: fresh ? colors.pulso : colors.mut }]} />
        <Txt variant="caption" color={colors.neblina}>
          {rotuloPublicacao(publishedAt, origin)}
        </Txt>
      </View>
      {sponsored ? (
        <View style={[o.tag, { backgroundColor: colors.violeta }]}>
          <Txt variant="caption" color={colors.neblina}>
            Patrocinado
          </Txt>
        </View>
      ) : null}
    </View>
  );
}

const o = StyleSheet.create({
  row: { flexDirection: 'row', gap: 6, flexWrap: 'wrap' },
  tag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(23,33,31,0.78)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: radius.pill,
  },
  dot: { width: 7, height: 7, borderRadius: 4 },
});

/** Bloco para abas que exigem conta (Publicar, Salvos, Perfil). */
export function LoginGate({ title, text }: { title: string; text: string }) {
  return (
    <Screen style={{ justifyContent: 'center' }}>
      <Empty
        title={title}
        text={text}
        action={
          <View style={{ gap: space.sm }}>
            <Button title="Entrar" onPress={() => router.push('/entrar')} />
            <Button
              title="Criar conta"
              kind="ghost"
              onPress={() => router.push({ pathname: '/entrar', params: { modo: 'criar' } })}
            />
          </View>
        }
      />
    </Screen>
  );
}

export function SectionTitle({ children }: { children: ReactNode }) {
  return (
    <Txt variant="label" style={{ marginTop: space.lg, marginBottom: space.sm }}>
      {children}
    </Txt>
  );
}

export function Empty({ title, text, action }: { title: string; text: string; action?: ReactNode }) {
  return (
    <View style={{ alignItems: 'center', gap: space.sm, padding: space.xl }}>
      <Txt variant="title" style={{ textAlign: 'center' }}>
        {title}
      </Txt>
      <Txt color={colors.mut} style={{ textAlign: 'center' }}>
        {text}
      </Txt>
      {action ? <View style={{ marginTop: space.md, alignSelf: 'stretch' }}>{action}</View> : null}
    </View>
  );
}
