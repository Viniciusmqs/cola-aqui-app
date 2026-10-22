import Ionicons from '@expo/vector-icons/Ionicons';
import { Tabs } from 'expo-router/js-tabs';
import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Txt } from '@/components/ui';
import { colors, fonts } from '@/constants/theme';

type IconName = keyof typeof Ionicons.glyphMap;

/** Cinco destinos do MVP (PRD 3): Explorar, Mapa, Publicar, Salvos, Perfil. */
const TABS: { name: string; label: string; icon: IconName; iconOn: IconName }[] = [
  { name: 'index', label: 'Explorar', icon: 'compass-outline', iconOn: 'compass' },
  { name: 'mapa', label: 'Mapa', icon: 'map-outline', iconOn: 'map' },
  { name: 'publicar', label: 'Publicar', icon: 'add', iconOn: 'add' },
  { name: 'salvos', label: 'Salvos', icon: 'bookmark-outline', iconOn: 'bookmark' },
  { name: 'perfil', label: 'Perfil', icon: 'person-outline', iconOn: 'person' },
];

export default function TabsLayout() {
  const insets = useSafeAreaInsets();
  return (
    <Tabs
      screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: colors.carvao } }}
      tabBar={({ state, navigateToTab }) => (
        <View style={[s.bar, { paddingBottom: Math.max(insets.bottom, 10) }]}>
          {state.routes.map((route, i) => {
            const tab = TABS.find((t) => t.name === route.name);
            if (!tab) return null;
            const focused = state.index === i;
            const isPost = tab.name === 'publicar';
            return (
              <Pressable
                key={route.key}
                accessibilityRole="tab"
                accessibilityState={{ selected: focused }}
                accessibilityLabel={tab.label}
                onPress={() => {
                  if (!focused) navigateToTab(route.key);
                }}
                style={s.item}>
                {isPost ? (
                  <View style={s.post}>
                    <Ionicons name="add" size={26} color={colors.carvao} />
                  </View>
                ) : (
                  <Ionicons
                    name={focused ? tab.iconOn : tab.icon}
                    size={23}
                    color={focused ? colors.pulso : colors.mut}
                  />
                )}
                <Txt
                  variant="caption"
                  color={focused ? colors.neblina : colors.mut}
                  style={{ fontFamily: focused ? fonts.semibold : fonts.medium }}>
                  {tab.label}
                </Txt>
              </Pressable>
            );
          })}
        </View>
      )}>
      {TABS.map((t) => (
        <Tabs.Screen key={t.name} name={t.name} options={{ title: t.label }} />
      ))}
    </Tabs>
  );
}

const s = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    backgroundColor: colors.carvao,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.carvao3,
    paddingTop: 8,
  },
  item: { flex: 1, alignItems: 'center', gap: 3, minHeight: 48, justifyContent: 'center' },
  post: {
    width: 48,
    height: 34,
    borderRadius: 17,
    backgroundColor: colors.pulso,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
