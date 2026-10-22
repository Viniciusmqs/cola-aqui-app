import { BricolageGrotesque_700Bold, BricolageGrotesque_800ExtraBold } from '@expo-google-fonts/bricolage-grotesque';
import { Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold } from '@expo-google-fonts/inter';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useFonts } from 'expo-font';
import { DarkTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';

import { colors } from '@/constants/theme';
import { AuthProvider, useAuth } from '@/lib/auth';
import { RegionProvider } from '@/lib/region';

SplashScreen.preventAutoHideAsync();

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

  const ready = fontsLoaded && !loading;
  useEffect(() => {
    if (ready) SplashScreen.hideAsync();
  }, [ready]);
  if (!ready) return null;

  // Visitante navega sem conta; login só aparece quando uma ação exige (RF-01, RF-02)
  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.carvao } }}>
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="lugar/[id]" />
      <Stack.Screen name="entrar" options={{ presentation: 'modal' }} />
      <Stack.Screen name="regiao" options={{ presentation: 'modal' }} />
      <Stack.Screen name="reivindicar/[id]" options={{ presentation: 'modal' }} />
      <Stack.Screen name="parceiro/[id]" />
      <Stack.Screen name="moderacao" />
    </Stack>
  );
}

export default function RootLayout() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <RegionProvider>
          <ThemeProvider value={theme}>
            <StatusBar style="light" />
            <RootStack />
          </ThemeProvider>
        </RegionProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}
