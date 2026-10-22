import { useQuery } from '@tanstack/react-query';

import { useAuth } from './auth';
import { supabase } from './supabase';
import type { Coords, FeedItem, NearbyPlace, PlaceDetail, Profile } from './types';

const round = (n: number) => Math.round(n * 1000) / 1000; // ~100 m, evita refetch a cada passo

export function useFeed(coords: Coords) {
  return useQuery({
    queryKey: ['feed', round(coords.lat), round(coords.lng)],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('feed_nearby', { p_lat: coords.lat, p_lng: coords.lng });
      if (error) throw error;
      return (data ?? []) as FeedItem[];
    },
    refetchInterval: 60_000,
  });
}

export function usePlacesNearby(coords: Coords, raio = 20000) {
  return useQuery({
    queryKey: ['places', round(coords.lat), round(coords.lng), raio],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('places_nearby', {
        p_lat: coords.lat,
        p_lng: coords.lng,
        p_raio_m: raio,
      });
      if (error) throw error;
      return (data ?? []) as NearbyPlace[];
    },
    refetchInterval: 60_000,
  });
}

export function usePlace(id: string) {
  return useQuery({
    queryKey: ['place', id],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('place_detail', { p_place: id });
      if (error) throw error;
      return ((data ?? []) as PlaceDetail[])[0] ?? null;
    },
  });
}

export function usePlacePosts(id: string) {
  return useQuery({
    queryKey: ['place-posts', id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('posts')
        .select('id, midia_path, tipo, legenda, origem, created_at, autor:profiles(username)')
        .eq('place_id', id)
        .eq('status', 'publicado')
        .gt('expira_em', new Date().toISOString())
        .order('created_at', { ascending: false })
        .limit(30);
      if (error) throw error;
      return data ?? [];
    },
    refetchInterval: 60_000,
  });
}

export function useMyProfile() {
  const { session } = useAuth();
  const uid = session?.user.id;
  return useQuery({
    queryKey: ['me', uid],
    enabled: !!uid,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, username, nome, foto_url, bairro')
        .eq('id', uid!)
        .single();
      if (error) throw error;
      return data as Profile;
    },
  });
}

export function useMyPosts() {
  const { session } = useAuth();
  const uid = session?.user.id;
  return useQuery({
    queryKey: ['my-posts', uid],
    enabled: !!uid,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('posts')
        .select('id, created_at, expira_em, status, place:places(nome)')
        .eq('autor', uid!)
        .order('created_at', { ascending: false })
        .limit(30);
      if (error) throw error;
      return data ?? [];
    },
  });
}
