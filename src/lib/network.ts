import NetInfo from '@react-native-community/netinfo';
import { onlineManager } from '@tanstack/react-query';
import { useEffect, useState } from 'react';

/** Liga o React Query ao estado da rede: pausa e retoma consultas sozinho (PRD 3.1, conexão instável). */
export function setupOnlineManager() {
  onlineManager.setEventListener((setOnline) =>
    NetInfo.addEventListener((state) => setOnline(state.isConnected !== false)),
  );
}

export function useIsOffline() {
  const [offline, setOffline] = useState(false);
  useEffect(
    () =>
      NetInfo.addEventListener((state) => {
        setOffline(state.isConnected === false);
      }),
    [],
  );
  return offline;
}
