import { Modal, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors, radius, space } from '@/constants/theme';

import { Txt } from './ui';

export type Choice = { key: string; label: string; hint?: string; danger?: boolean };

/** Folha de opções simples (o Alert do Android só aceita 3 botões). */
export function ChoiceSheet({
  visible,
  title,
  subtitle,
  choices,
  onSelect,
  onClose,
}: {
  visible: boolean;
  title: string;
  subtitle?: string;
  choices: Choice[];
  onSelect: (key: string) => void;
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={s.backdrop} onPress={onClose} accessibilityLabel="Fechar" />
      <View style={[s.sheet, { paddingBottom: Math.max(insets.bottom, space.md) }]}>
        <View style={s.handle} />
        <Txt variant="label">{title}</Txt>
        {subtitle ? (
          <Txt variant="small" color={colors.mut} style={{ marginTop: 4 }}>
            {subtitle}
          </Txt>
        ) : null}
        <View style={{ marginTop: space.md, gap: space.xs }}>
          {choices.map((c) => (
            <Pressable
              key={c.key}
              accessibilityRole="button"
              onPress={() => {
                onClose();
                onSelect(c.key);
              }}
              style={({ pressed }) => [s.option, pressed && { backgroundColor: colors.carvao3 }]}>
              <Txt variant="label" color={c.danger ? colors.rosa : colors.neblina}>
                {c.label}
              </Txt>
              {c.hint ? (
                <Txt variant="small" color={colors.mut}>
                  {c.hint}
                </Txt>
              ) : null}
            </Pressable>
          ))}
          <Pressable onPress={onClose} style={s.option} accessibilityRole="button">
            <Txt variant="label" color={colors.mut}>
              Cancelar
            </Txt>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)' },
  sheet: {
    backgroundColor: colors.carvao2,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    padding: space.md,
  },
  handle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.carvao3,
    marginBottom: space.md,
  },
  option: { paddingVertical: 14, paddingHorizontal: space.sm, borderRadius: radius.sm, gap: 2 },
});
