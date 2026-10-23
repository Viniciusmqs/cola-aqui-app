import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Vídeos que a pessoa já assistiu neste aparelho (últimos 300, por 24 h). O servidor rebaixa
 * esses vídeos para o feed não repetir o mesmo topo a cada abertura. Nada disso sai do aparelho
 * além da lista de ids enviada na consulta.
 */
const KEY = 'colaaqui.seen.v1';
const MAX = 300;
const TTL = 24 * 60 * 60 * 1000;

let mem: Record<string, number> = {};
let loaded = false;
let saveTimer: ReturnType<typeof setTimeout> | null = null;

export async function loadSeen() {
  if (loaded) return;
  try {
    const raw = await AsyncStorage.getItem(KEY);
    mem = raw ? (JSON.parse(raw) as Record<string, number>) : {};
  } catch {
    mem = {};
  }
  loaded = true;
}

export function markSeen(id: string) {
  mem[id] = Date.now();
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(persist, 1500);
}

function persist() {
  const corte = Date.now() - TTL;
  const vivos = Object.entries(mem)
    .filter(([, t]) => t > corte)
    .sort((a, b) => b[1] - a[1])
    .slice(0, MAX);
  mem = Object.fromEntries(vivos);
  AsyncStorage.setItem(KEY, JSON.stringify(mem)).catch(() => {});
}

/** Lista para mandar ao servidor (mais recentes primeiro). */
export function seenSnapshot() {
  const corte = Date.now() - TTL;
  return Object.entries(mem)
    .filter(([, t]) => t > corte)
    .sort((a, b) => b[1] - a[1])
    .slice(0, MAX)
    .map(([id]) => id);
}
