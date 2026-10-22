import * as Linking from 'expo-linking';
import { Alert, Platform, Share } from 'react-native';

import type { Choice } from '@/components/choice-sheet';

import { track } from './analytics';
import { mensagemDeErro } from './format';
import { supabase } from './supabase';

type Destino = { id: string; name: string; lat: number; lng: number; address?: string | null };

export const rotaChoices: Choice[] = [
  { key: 'maps', label: Platform.OS === 'ios' ? 'Apple Maps' : 'Google Maps' },
  { key: 'waze', label: 'Waze' },
  { key: 'uber', label: 'Uber' },
];

const mapsWeb = (d: Destino) => `https://www.google.com/maps/dir/?api=1&destination=${d.lat},${d.lng}`;

/** "Como chegar" (RF-08, QA-06): abre o app externo com o destino; sem app, cai na rota web. */
export async function abrirRota(d: Destino, app: string) {
  const nome = encodeURIComponent(d.name);
  const urls: Record<string, string> = {
    maps: Platform.OS === 'ios' ? `https://maps.apple.com/?daddr=${d.lat},${d.lng}&q=${nome}` : mapsWeb(d),
    waze: `https://waze.com/ul?ll=${d.lat},${d.lng}&navigate=yes`,
    uber: `https://m.uber.com/ul/?action=setPickup&pickup=my_location&dropoff[latitude]=${d.lat}&dropoff[longitude]=${d.lng}&dropoff[nickname]=${nome}`,
  };
  track('route_click', { place: d.id }, { app });
  try {
    await Linking.openURL(urls[app] ?? mapsWeb(d));
  } catch {
    await Linking.openURL(mapsWeb(d));
  }
}

/** Compartilhar lugar (RF-08). Enquanto não há página web pública, vai nome, endereço e mapa. */
export async function compartilharLugar(d: Destino) {
  track('share_click', { place: d.id });
  const linhas = [
    `Bora no ${d.name}?`,
    d.address ?? '',
    `📍 https://maps.google.com/?q=${d.lat},${d.lng}`,
    'Vi no Cola Aqui',
  ];
  try {
    await Share.share({ message: linhas.filter(Boolean).join('\n') });
  } catch {
    // a pessoa fechou o compartilhamento
  }
}

export const denunciaChoices: Choice[] = [
  { key: 'inadequado', label: 'Conteúdo inadequado' },
  { key: 'falso', label: 'Falso ou enganoso', hint: 'Não é deste lugar ou não mostra a realidade' },
  { key: 'spam', label: 'Spam ou propaganda escondida' },
  { key: 'menor_de_idade', label: 'Expõe menor de idade', danger: true },
  { key: 'violencia', label: 'Violência ou risco', danger: true },
  { key: 'direitos', label: 'Usa minha imagem ou obra sem permissão' },
  { key: 'outro', label: 'Outro motivo' },
];

/** Denúncia (RF-12): feedback neutro, sem expor o que acontece com o autor. */
export async function denunciar(target: { post?: string; place?: string }, reason: string) {
  const { error } = await supabase.rpc('report_content', {
    p_post: target.post ?? null,
    p_place: target.place ?? null,
    p_reason: reason,
  });
  if (error) Alert.alert('Não deu para enviar', mensagemDeErro(error));
  else Alert.alert('Denúncia recebida', 'Obrigado. Nossa equipe vai analisar.');
}
