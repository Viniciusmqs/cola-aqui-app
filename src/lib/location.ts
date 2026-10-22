import * as Location from 'expo-location';
import { useCallback, useEffect, useState } from 'react';

import type { Coords } from './types';

/** Centro de Brasília: usado quando a pessoa ainda não liberou a localização. */
export const BRASILIA: Coords = { lat: -15.7939, lng: -47.8828 };

type State = {
  coords: Coords;
  real: boolean; // true quando veio do GPS
  status: 'carregando' | 'ok' | 'negado' | 'erro';
};

async function lerLocalizacao(): Promise<State> {
  try {
    const perm = await Location.requestForegroundPermissionsAsync();
    if (perm.status !== 'granted') return { coords: BRASILIA, real: false, status: 'negado' };
    const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
    return { coords: { lat: pos.coords.latitude, lng: pos.coords.longitude }, real: true, status: 'ok' };
  } catch {
    return { coords: BRASILIA, real: false, status: 'erro' };
  }
}

export function useUserLocation() {
  const [state, setState] = useState<State>({ coords: BRASILIA, real: false, status: 'carregando' });

  useEffect(() => {
    let vivo = true;
    lerLocalizacao().then((s) => vivo && setState(s));
    return () => {
      vivo = false;
    };
  }, []);

  /** Lê a posição de novo; devolve as coordenadas só se vieram do GPS. */
  const refresh = useCallback(async () => {
    const s = await lerLocalizacao();
    setState(s);
    return s.real ? s.coords : null;
  }, []);

  return { ...state, refresh };
}
