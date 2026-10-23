import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { track } from './analytics';
import { useAuth } from './auth';
import { adjustFromServer, serverNow } from './clock';
import { useRegion } from './region';
import { loadSeen, seenSnapshot } from './seen';
import { signedUrls, supabase } from './supabase';
import type {
  FeedItem,
  FeedMode,
  NearbyPlace,
  PlaceDetail,
  PlaceEvent,
  PlaceHour,
  PlacePost,
  PostDetail,
  Profile,
} from './types';

const r3 = (n: number) => Math.round(n * 1000) / 1000;
const PAGE = 15;

/** Gera links temporários do vídeo e da miniatura numa chamada só. */
async function withMedia<T extends { media_path: string; thumb_path?: string | null }>(rows: T[]) {
  const paths = rows.flatMap((r) => (r.thumb_path ? [r.media_path, r.thumb_path] : [r.media_path]));
  const urls = await signedUrls(paths);
  return rows.map((r) => ({
    ...r,
    media_url: urls.get(r.media_path) ?? null,
    thumb_url: r.thumb_path ? (urls.get(r.thumb_path) ?? null) : null,
  }));
}

/**
 * Feed Explorar (RF-03) ordenado por relevância no servidor (feed_ranked).
 * Cada abertura ou atualização (foto = contador) pede a 1ª página sem horário: o servidor usa a hora dele e
 * devolve esse instante (as_of). As páginas seguintes reutilizam o mesmo instante, então a lista não muda de
 * ordem enquanto a pessoa rola, mesmo se o relógio do celular estiver errado. Novos vídeos: useNewPosts.
 */
type FeedPage = { rows: (FeedItem & { media_url: string | null; thumb_url: string | null })[]; asOf: string | null };
type FeedCursor = { offset: number; asOf: string | null };

export function useExploreFeed(mode: FeedMode, category: string | null, foto: number) {
  const { coords, radius } = useRegion();
  return useInfiniteQuery({
    queryKey: ['feed', mode, category, r3(coords.lat), r3(coords.lng), radius, foto],
    initialPageParam: { offset: 0, asOf: null } as FeedCursor,
    queryFn: async ({ pageParam }): Promise<FeedPage> => {
      if (pageParam.offset === 0) await loadSeen();
      const started = Date.now();
      const { data, error } = await supabase.rpc('feed_ranked', {
        p_lat: coords.lat,
        p_lng: coords.lng,
        p_radius_m: radius,
        p_mode: mode,
        p_category: category,
        p_as_of: pageParam.asOf,
        p_offset: pageParam.offset,
        p_limit: PAGE,
        p_seen: seenFor(foto),
      });
      if (error) throw error;
      const rows = (data ?? []) as FeedItem[];
      adjustFromServer(rows[0]?.server_now, started);
      // sem vídeo, a foto vale "agora" pelo relógio do servidor (estimado) — o aviso de novos conta a partir daí
      const asOf = rows[0]?.as_of ?? pageParam.asOf ?? new Date(serverNow()).toISOString();
      return { rows: await withMedia(rows), asOf };
    },
    getNextPageParam: (last, all): FeedCursor | null =>
      last.rows.length < PAGE ? null : { offset: all.reduce((n, p) => n + p.rows.length, 0), asOf: last.asOf },
    staleTime: Infinity, // a foto só muda quando a pessoa atualiza
    gcTime: 10 * 60_000,
    // ao atualizar o MESMO filtro, a lista antiga fica na tela até a nova chegar (sem piscar o esqueleto);
    // trocando Agora/Hoje ou categoria, mostra o esqueleto (lista velha ali seria enganosa)
    placeholderData: (prev, prevQuery) => {
      const k = prevQuery?.queryKey;
      const mesmoFiltro =
        !!k &&
        k[1] === mode &&
        k[2] === category &&
        k[3] === r3(coords.lat) &&
        k[4] === r3(coords.lng) &&
        k[5] === radius;
      return mesmoFiltro ? prev : undefined;
    },
  });
}

// lista de vistos congelada por foto: todas as páginas da mesma foto rebaixam os mesmos vídeos
const seenByFoto = new Map<number, string[]>();
function seenFor(foto: number) {
  let v = seenByFoto.get(foto);
  if (!v) {
    v = seenSnapshot();
    seenByFoto.clear();
    seenByFoto.set(foto, v);
  }
  return v;
}

/** Quantos vídeos novos chegaram desde a foto do feed (aviso "N vídeos novos"). asOf vem do servidor. */
export function useNewPosts(category: string | null, asOf: string | null, enabled: boolean) {
  const { coords, radius } = useRegion();
  return useQuery({
    queryKey: ['feed-new', category, r3(coords.lat), r3(coords.lng), radius, asOf],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('feed_new_count', {
        p_lat: coords.lat,
        p_lng: coords.lng,
        p_radius_m: radius,
        p_category: category,
        p_since: asOf,
      });
      if (error) throw error;
      return (data as number | null) ?? 0;
    },
    enabled: enabled && !!asOf,
    refetchInterval: 45_000,
    refetchIntervalInBackground: false,
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
    // muda na hora (otimista); se o servidor recusar, volta e o erro aparece
    onMutate: async ({ placeId, saved }) => {
      const key = ['saved', session?.user.id];
      await qc.cancelQueries({ queryKey: key });
      const antes = qc.getQueryData<SavedRow[]>(key);
      qc.setQueryData<SavedRow[]>(key, (old = []) =>
        saved
          ? old.filter((r) => r.place_id !== placeId)
          : [{ place_id: placeId, created_at: new Date().toISOString(), place: null }, ...old],
      );
      return { antes, key };
    },
    onError: (_e, _v, ctx) => {
      if (ctx) qc.setQueryData(ctx.key, ctx.antes);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ['saved'] }),
  });
}

type SavedRow = { place_id: string; created_at: string; place: unknown };

/** Uma publicação aprovada, para o player em tela cheia. */
export function usePost(id: string) {
  return useQuery({
    queryKey: ['post', id],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('post_detail', { p_post: id });
      if (error) throw error;
      const row = ((data ?? []) as PostDetail[])[0];
      if (!row) return null;
      return (await withMedia([row]))[0];
    },
  });
}
