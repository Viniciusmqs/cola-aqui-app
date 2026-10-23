import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Location from 'expo-location';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

import { supabase } from './supabase';
import type { Coords, Region } from './types';

/**
 * Região de descoberta (RF-01, RF-04, QA-02).
 * Negar o GPS nunca bloqueia: a pessoa escolhe a região manualmente.
 * A posição do usuário só é usada no aparelho para buscar perto; nunca vai para posts.
 */
const KEY = 'colaaqui.region';
export const BRASILIA: Region = {
  slug: 'brasilia',
  name: 'Brasília (todas)',
  lat: -15.7939,
  lng: -47.8828,
  radius_m: 30000,
};
const RAIO_GPS = 10000;

type Mode = 'gps' | 'region';

type RegionState = {
  mode: Mode;
  coords: Coords;
  radius: number;
  label: string;
  regionSlug: string | null;
  gps: 'desconhecido' | 'pedindo' | 'ok' | 'negado' | 'erro';
  regions: Region[];
  ativarGps: () => Promise<boolean>;
  chooseRegion: (r: Region) => void;
};

const Ctx = createContext<RegionState | null>(null);

type Saved = { mode: Mode; region?: Region };

export function RegionProvider({ children }: { children: ReactNode }) {
  const [mode, setMode] = useState<Mode>('region');
  const [region, setRegion] = useState<Region>(BRASILIA);
  const [gpsCoords, setGpsCoords] = useState<Coords | null>(null);
  const [gps, setGps] = useState<RegionState['gps']>('desconhecido');
  const [regions, setRegions] = useState<Region[]>([BRASILIA]);

  const readGps = useCallback(async () => {
    setGps('pedindo');
    try {
      const perm = await Location.requestForegroundPermissionsAsync();
      if (perm.status !== 'granted') {
        setGps('negado');
        return false;
      }
      // precisão equilibrada basta para "perto de você" (minimização de dados, PRD 5.5)
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      setGpsCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude });
      setGps('ok');
      return true;
    } catch {
      setGps('erro');
      return false;
    }
  }, []);

  useEffect(() => {
    let vivo = true;
    supabase.rpc('list_regions').then(({ data }) => {
      if (vivo && data?.length) setRegions(data as Region[]);
    });
    (async () => {
      let saved: Saved | null = null;
      try {
        const raw = await AsyncStorage.getItem(KEY);
        saved = raw ? (JSON.parse(raw) as Saved) : null;
      } catch {
        saved = null;
      }
      if (!vivo) return;
      if (saved?.mode === 'region' && saved.region) {
        setRegion(saved.region);
        setMode('region');
        return;
      }
      // Não abre o pedido do sistema sozinho: a tela de boas-vindas explica antes (boa prática de permissão).
      // Só lê o GPS direto se a pessoa já tinha permitido.
      try {
        const perm = await Location.getForegroundPermissionsAsync();
        if (perm.status !== 'granted') {
          if (perm.status === 'denied' && !perm.canAskAgain) setGps('negado');
          return;
        }
      } catch {
        return;
      }
      const ok = await readGps();
      if (vivo && ok) setMode('gps');
    })();
    return () => {
      vivo = false;
    };
  }, [readGps]);

  const persist = (s: Saved) => AsyncStorage.setItem(KEY, JSON.stringify(s)).catch(() => {});

  const ativarGps = useCallback(async () => {
    const ok = await readGps();
    if (ok) {
      setMode('gps');
      persist({ mode: 'gps' });
    }
    return ok;
  }, [readGps]);

  const chooseRegion = useCallback((r: Region) => {
    setRegion(r);
    setMode('region');
    persist({ mode: 'region', region: r });
  }, []);

  const value = useMemo<RegionState>(() => {
    const usingGps = mode === 'gps' && gpsCoords;
    return {
      mode: usingGps ? 'gps' : 'region',
      coords: usingGps ? gpsCoords : { lat: region.lat, lng: region.lng },
      radius: usingGps ? RAIO_GPS : region.radius_m,
      label: usingGps ? 'Perto de você' : region.name,
      regionSlug: usingGps ? null : region.slug,
      gps,
      regions,
      ativarGps,
      chooseRegion,
    };
  }, [mode, gpsCoords, region, gps, regions, ativarGps, chooseRegion]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useRegion() {
  const v = useContext(Ctx);
  if (!v) throw new Error('useRegion fora do RegionProvider');
  return v;
}
