import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';

/**
 * Som dos vídeos no feed. Começa mudo (prática de mercado: ninguém leva susto ao rolar);
 * um toque no alto-falante liga o som para todos os vídeos até a pessoa desligar.
 */
type Sound = { muted: boolean; toggle: () => void };
const Ctx = createContext<Sound>({ muted: true, toggle: () => {} });

export function SoundProvider({ children }: { children: ReactNode }) {
  const [muted, setMuted] = useState(true);
  const value = useMemo(() => ({ muted, toggle: () => setMuted((m) => !m) }), [muted]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const useSound = () => useContext(Ctx);
