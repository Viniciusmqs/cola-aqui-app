export type PostOrigin = 'user' | 'creator' | 'establishment';
export type PostStatus = 'pending_review' | 'published' | 'rejected' | 'hidden' | 'removed';
export type FeedMode = 'agora' | 'hoje' | 'tudo';

export type Coords = { lat: number; lng: number };

export type Region = { slug: string; name: string; lat: number; lng: number; radius_m: number };

export type FeedItem = {
  id: string;
  caption: string | null;
  origin: PostOrigin;
  sponsored: boolean;
  published_at: string;
  is_fresh: boolean;
  media_path: string;
  media_mime: string;
  place_id: string;
  place_name: string;
  place_category: string;
  place_neighborhood: string | null;
  author_username: string;
  distance_m: number;
  media_url?: string | null;
};

export type PlacePost = Omit<
  FeedItem,
  'place_id' | 'place_name' | 'place_category' | 'place_neighborhood' | 'distance_m'
>;

export type NearbyPlace = {
  id: string;
  name: string;
  category: string;
  neighborhood: string | null;
  address: string | null;
  is_founder: boolean;
  lat: number;
  lng: number;
  distance_m: number;
  fresh_posts: number;
  last_published_at: string | null;
};

export type PlaceDetail = {
  id: string;
  name: string;
  category: string;
  address: string | null;
  neighborhood: string | null;
  phone: string | null;
  instagram: string | null;
  website: string | null;
  cover_url: string | null;
  is_founder: boolean;
  lat: number;
  lng: number;
  has_manager: boolean;
  can_manage: boolean;
  last_published_at: string | null;
};

export type PlaceEvent = {
  id: string;
  title: string;
  description: string | null;
  starts_at: string;
  ends_at: string | null;
  ticket_url: string | null;
};

export type PlaceHour = { id: string; weekday: number; opens: string; closes: string };

export type Profile = {
  id: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
  role: 'user' | 'creator' | 'moderator' | 'admin';
};
