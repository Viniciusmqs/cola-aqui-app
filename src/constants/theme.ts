/**
 * Identidade "Rolê" do Cola Aqui (manual de identidade, arquivo 02 da Fase Zero).
 * O app é escuro por padrão: Carvão no fundo, Pulso como cor de ação.
 */
export const colors = {
  carvao: '#17211F',
  carvao2: '#222E2B',
  carvao3: '#2C3A36',
  pulso: '#CAFA54',
  rosa: '#FF4D9D',
  algodao: '#FFD1E6',
  neblina: '#F5F5EE',
  violeta: '#6D4AD5',
  mut: '#A9B4AC',
  erro: '#FF6B6B',
} as const;

export const fonts = {
  display: 'BricolageGrotesque_800ExtraBold',
  displayBold: 'BricolageGrotesque_700Bold',
  regular: 'Inter_400Regular',
  medium: 'Inter_500Medium',
  semibold: 'Inter_600SemiBold',
  bold: 'Inter_700Bold',
} as const;

export const space = { xs: 4, sm: 8, md: 16, lg: 24, xl: 32, xxl: 48 } as const;
export const radius = { sm: 8, md: 14, lg: 22, pill: 999 } as const;

/** Rótulo de origem: obrigatório em todo registro (regra do manual). */
export const originLabel = {
  comunidade: 'registro da comunidade',
  estabelecimento: 'publicado pelo estabelecimento',
  patrocinado: 'patrocinado',
} as const;

export const placeKindLabel: Record<string, string> = {
  bar: 'Bar',
  restaurante: 'Restaurante',
  balada: 'Balada',
  casa_de_show: 'Casa de show',
  festa: 'Festa',
  evento: 'Evento',
  feira: 'Feira',
  cultura: 'Cultura',
  esporte: 'Esporte e lazer',
  atletica: 'Atlética',
  outro: 'Outro',
};
