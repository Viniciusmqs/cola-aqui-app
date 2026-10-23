import { BricolageGrotesque_700Bold, BricolageGrotesque_800ExtraBold } from '@expo-google-fonts/bricolage-grotesque';
import { Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold } from '@expo-google-fonts/inter';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useFonts } from 'expo-font';
import { DarkTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useState } from 'react';
import { View } from 'react-native';

import { BrandIntro } from '@/components/brand';
import { Onboarding } from '@/components/onboarding';
import { OfflineBanner } from '@/components/offline-banner';
import { colors } from '@/constants/theme';
import { AuthProvider, useAuth } from '@/lib/auth';
import { setupOnlineManager } from '@/lib/network';
import { RegionProvider } from '@/lib/region';
import { SoundProvider } from '@/lib/sound';

const ONBOARDING_KEY = 'colaaqui.onboarding.v1';

SplashScreen.preventAutoHideAsync();
SplashScreen.setOptions({ duration: 250, fade: true });
setupOnlineManager();

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 2, staleTime: 30_000 } },
});

const theme = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    background: colors.carvao,
    card: colors.carvao,
    primary: colors.pulso,
    text: colors.neblina,
    border: colors.carvao3,
  },
};

function RootStack() {
  const { loading } = useAuth();
  const [fontsLoaded] = useFonts({
    BricolageGrotesque_700Bold,
    BricolageGrotesque_800ExtraBold,
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
  });

  // primeira abertura → boas-vindas (lido uma vez, antes de esconder a splash)
  const [firstRun, setFirstRun] = useState<boolean | null>(null);
  const [intro, setIntro] = useState(true);
  useEffect(() => {
    AsyncStorage.getItem(ONBOARDING_KEY)
      .then((v) => setFirstRun(v !== 'ok'))
      .catch(() => setFirstRun(false));
  }, []);

  const ready = fontsLoaded && !loading && firstRun !== null;
  useEffect(() => {
    if (ready) SplashScreen.hideAsync();
  }, [ready]);
  if (!ready) return null;

  // Visitante navega sem conta; login só aparece quando uma ação exige (RF-01, RF-02)
  return (
    <View style={{ flex: 1, backgroundColor: colors.carvao }}>
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.carvao } }}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="lugar/[id]" />
        <Stack.Screen name="entrar" options={{ presentation: 'modal' }} />
        <Stack.Screen name="regiao" options={{ presentation: 'modal' }} />
        <Stack.Screen name="reivindicar/[id]" options={{ presentation: 'modal' }} />
        <Stack.Screen name="parceiro/[id]" />
        <Stack.Screen name="moderacao" />
        <Stack.Screen name="video/[id]" options={{ animation: 'fade_from_bottom', gestureEnabled: true }} />
        <Stack.Screen name="buscar" options={{ animation: 'fade' }} />
      </Stack>
      <OfflineBanner />
      {firstRun ? (
        <Onboarding
          onDone={() => {
            AsyncStorage.setItem(ONBOARDING_KEY, 'ok').catch(() => {});
            setFirstRun(false);
          }}
        />
      ) : null}
      {intro ? <BrandIntro onDone={() => setIntro(false)} /> : null}
    </View>
  );
}

export default function RootLayout() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <RegionProvider>
          <SoundProvider>
            <ThemeProvider value={theme}>
              <StatusBar style="light" />
              <RootStack />
            </ThemeProvider>
          </SoundProvider>
        </RegionProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}
