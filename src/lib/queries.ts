import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { track } from './analytics';
import { useAuth } from './auth';
import { useRegion } from './region';
import { signedUrls, supabase } from './supabase';
import type { FeedItem, FeedMode, NearbyPlace, PlaceDetail, PlaceEvent, PlaceHour, PlacePost, Profile } from './types';

const r3 = (n: number) => Math.round(n * 1000) / 1000;
const PAGE = 15;

async function withMedia<T extends { media_path: string }>(rows: T[]) {
  const urls = await signedUrls(rows.map((r) => r.media_path));
  return rows.map((r) => ({ ...r, media_url: urls.get(r.media_path) ?? null }));
}

/** Feed Explorar paginado por cursor (RF-03). */
export function useExploreFeed(mode: FeedMode, category: string | null) {
  const { coords, radius } = useRegion();
  return useInfiniteQuery({
    queryKey: ['feed', mode, category, r3(coords.lat), r3(coords.lng), radius],
    initialPageParam: null as string | null,
    queryFn: async ({ pageParam }) => {
      const { data, error } = await supabase.rpc('explore_feed', {
        p_lat: coords.lat,
        p_lng: coords.lng,
        p_radius_m: radius,
        p_mode: mode,
        p_category: category,
        p_before: pageParam,
        p_limit: PAGE,
      });
      if (error) throw error;
      return withMedia((data ?? []) as FeedItem[]);
    },
    getNextPageParam: (last) => (last.length < PAGE ? null : (last.at(-1)?.published_at ?? null)),
    refetchInterval: 60_000,
  });
}

export function usePlacesNearby(opts: { category?: string | null; search?: string; radius?: number } = {}) {
  const { coords, radius } = useRegion();
  const r = opts.radius ?? radius;
  return useQuery({
    queryKey: ['places', r3(coords.lat), r3(coords.lng), r, opts.category ?? null, opts.search ?? ''],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('places_nearby', {
        p_lat: coords.lat,
        p_lng: coords.lng,
        p_radius_m: r,
        p_category: opts.category ?? null,
        p_search: opts.search?.trim() || null,
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
      const { data, error } = await supabase.rpc('place_posts', { p_place: id, p_limit: 20 });
      if (error) throw error;
      return withMedia((data ?? []) as PlacePost[]);
    },
    refetchInterval: 60_000,
  });
}

export function usePlaceInfo(id: string) {
  return useQuery({
    queryKey: ['place-info', id],
    queryFn: async () => {
      const desde = new Date(Date.now() - 6 * 3600 * 1000).toISOString();
      const [hours, events] = await Promise.all([
        supabase.from('place_hours').select('id, weekday, opens, closes').eq('place_id', id).order('weekday'),
        supabase
          .from('place_events')
          .select('id, title, description, starts_at, ends_at, ticket_url')
          .eq('place_id', id)
          .gte('starts_at', desde)
          .order('starts_at')
          .limit(10),
      ]);
      if (hours.error) throw hours.error;
      if (events.error) throw events.error;
      return { hours: (hours.data ?? []) as PlaceHour[], events: (events.data ?? []) as PlaceEvent[] };
    },
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
        .select('id, username, display_name, avatar_url, role')
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
        .select('id, status, created_at, published_at, moderation_note, place:places(id, name)')
        .eq('author', uid!)
        .order('created_at', { ascending: false })
        .limit(50);
      if (error) throw error;
      return data ?? [];
    },
  });
}

/** Lugares que eu gerencio (Cola Parceiros). */
export function useMyPlaces() {
  const { session } = useAuth();
  const uid = session?.user.id;
  return useQuery({
    queryKey: ['my-places', uid],
    enabled: !!uid,
    queryFn: async () => {
      const { data: orgs, error } = await supabase
        .from('partner_members')
        .select('organization_id')
        .eq('user_id', uid!);
      if (error) throw error;
      const ids = (orgs ?? []).map((o) => o.organization_id as string);
      if (ids.length === 0) return [];
      const { data, error: e2 } = await supabase.from('places').select('id, name, category').in('organization_id', ids);
      if (e2) throw e2;
      return data ?? [];
    },
  });
}

/** Salvos (RF-09): salvar de novo não duplica (chave única no banco). */
export function useSaved() {
  const { session } = useAuth();
  const uid = session?.user.id;
  return useQuery({
    queryKey: ['saved', uid],
    enabled: !!uid,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('place_saves')
        .select('place_id, created_at, place:places(id, name, category, neighborhood)')
        .eq('user_id', uid!)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useToggleSave() {
  const { session } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ placeId, saved }: { placeId: string; saved: boolean }) => {
      const uid = session?.user.id;
      if (!uid) throw new Error('Entre na sua conta para salvar');
      if (saved) {
        const { error } = await supabase.from('place_saves').delete().eq('user_id', uid).eq('place_id', placeId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('place_saves').upsert({ user_id: uid, place_id: placeId });
        if (error) throw error;
        track('place_save', { place: placeId });
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['saved'] }),
  });
}
