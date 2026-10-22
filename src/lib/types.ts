export type PostOrigin = 'comunidade' | 'estabelecimento' | 'patrocinado';

export type FeedItem = {
  id: string;
  midia_path: string;
  tipo: 'video' | 'foto';
  legenda: string | null;
  origem: PostOrigin;
  created_at: string;
  expira_em: string;
  place_id: string;
  place_nome: string;
  place_tipo: string;
  place_bairro: string | null;
  autor_username: string;
  autor_foto: string | null;
  distancia_m: number;
};

export type NearbyPlace = {
  id: string;
  nome: string;
  tipo: string;
  bairro: string | null;
  endereco: string | null;
  fundador: boolean;
  lat: number;
  lng: number;
  distancia_m: number;
  registros_agora: number;
  ultimo_registro: string | null;
};

export type PlaceDetail = {
  id: string;
  nome: string;
  tipo: string;
  bairro: string | null;
  endereco: string | null;
  instagram: string | null;
  whatsapp: string | null;
  fundador: boolean;
  lat: number;
  lng: number;
};

export type Profile = {
  id: string;
  username: string;
  nome: string | null;
  foto_url: string | null;
  bairro: string | null;
};

export type Coords = { lat: number; lng: number };
