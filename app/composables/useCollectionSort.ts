import type { MaybeRefOrGetter } from 'vue';
import type { NormalizedAlbum } from '~/providers/types';
import type {
  CollectionSortConfig,
  CollectionSortContext,
  CollectionSortOptions,
  CollectionSortPresetId,
  CoverColor,
  GroupBy,
  SortRule,
} from '~/utils/collectionSort';
import { invoke } from '@tauri-apps/api/core';
import { computed, ref, toValue, watch } from 'vue';
import useLocalDb from '~/composables/useLocalDb';
import {
  applyCollectionSortPreset,
  COLLECTION_SORT_PRESETS,
  collectionSortNeedsCoverColors,
  createCollectionSortConfig,
  groupCollection,
  matchCollectionSortPreset,
  normalizeCollectionSortConfig,
  sortCollection,
} from '~/utils/collectionSort';

interface CoverColorResult extends CoverColor {
  albumId: string
}

const STORAGE_KEY = 'zinga.collectionSort';
const COLOR_BATCH_SIZE = 24;
const COLOR_RETRY_MS = 24 * 60 * 60 * 1000;

function loadConfig(): CollectionSortConfig {
  try {
    const raw = typeof localStorage === 'undefined' ? null : localStorage.getItem(STORAGE_KEY);
    return normalizeCollectionSortConfig(raw ? JSON.parse(raw) : null);
  } catch {
    return createCollectionSortConfig();
  }
}

const config = ref<CollectionSortConfig>(loadConfig());
const coverColors = ref<Record<string, CoverColor>>({});
const manualOrder = ref<Record<string, number>>({});
const artistSortNames = ref<Record<string, string>>({});
const contextLoaded = ref(false);
const computingColors = ref(false);
const colorProgress = ref({ done: 0, total: 0 });
const failedColorAttempts = new Map<string, number>();

let contextPromise: Promise<void> | null = null;
let colorJob: Promise<void> | null = null;
let pendingColorAlbums: readonly NormalizedAlbum[] | null = null;

function saveConfig() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(config.value));
  } catch (err) {
    console.error('Failed to save collection sort config:', err);
  }
}

function updateConfig(next: CollectionSortConfig) {
  config.value = next;
  saveConfig();
}

function applyPreset(presetId: CollectionSortPresetId) {
  updateConfig(applyCollectionSortPreset(config.value, presetId));
}

function setRules(rules: SortRule[]) {
  const next = normalizeCollectionSortConfig({ ...config.value, rules });
  updateConfig({ ...config.value, rules: next.rules, preset: matchCollectionSortPreset(next.rules, config.value.groupBy) });
}

function setGroupBy(groupBy: GroupBy) {
  updateConfig({ ...config.value, groupBy, preset: matchCollectionSortPreset(config.value.rules, groupBy) });
}

function setOption<K extends keyof CollectionSortOptions>(key: K, value: CollectionSortOptions[K]) {
  const next = normalizeCollectionSortConfig({ ...config.value, options: { ...config.value.options, [key]: value } });
  updateConfig({ ...config.value, options: next.options });
}

function resetConfig() {
  updateConfig(createCollectionSortConfig());
}

async function fetchContext() {
  const db = useLocalDb();
  try {
    const [order, sortNames, colors] = await Promise.all([
      db.getManualOrder(),
      db.getArtistSortNames(),
      db.getCoverColors(),
    ]);
    const known: Record<string, CoverColor> = {};
    for (const stored of colors) {
      if (stored.color) known[stored.albumId] = stored.color;
      else failedColorAttempts.set(stored.albumId, stored.computedAt);
    }
    manualOrder.value = order;
    artistSortNames.value = sortNames;
    coverColors.value = known;
    contextLoaded.value = true;
  } catch (err) {
    contextPromise = null;
    console.error('Failed to load collection sort data:', err);
  }
}

function loadContext(force = false): Promise<void> {
  if (force || !contextPromise) contextPromise = fetchContext();
  return contextPromise;
}

async function saveManualOrder(albumIds: string[]) {
  const previous = manualOrder.value;
  manualOrder.value = Object.fromEntries(albumIds.map((id, index) => [id, index]));
  try {
    await useLocalDb().setManualOrder(albumIds);
  } catch (err) {
    manualOrder.value = previous;
    console.error('Failed to save manual order:', err);
    throw err;
  }
}

async function setArtistSortName(artistId: string, sortName: string) {
  const name = sortName.trim();
  await useLocalDb().setArtistSortName(artistId, name);
  const next = { ...artistSortNames.value };
  if (name) next[artistId] = name;
  else delete next[artistId];
  artistSortNames.value = next;
}

async function removeArtistSortName(artistId: string) {
  await useLocalDb().deleteArtistSortName(artistId);
  const next = { ...artistSortNames.value };
  delete next[artistId];
  artistSortNames.value = next;
}

function missingColorItems(albums: readonly NormalizedAlbum[]) {
  const now = Date.now();
  return albums
    .filter((album) => {
      if (!album.coverUrl || !/^https?:\/\//i.test(album.coverUrl)) return false;
      if (coverColors.value[album.id]) return false;
      const failedAt = failedColorAttempts.get(album.id);
      return failedAt === undefined || now - failedAt > COLOR_RETRY_MS;
    })
    .map((album) => ({ albumId: album.id, coverUrl: album.coverUrl! }));
}

async function computeColorBatch(batch: { albumId: string, coverUrl: string }[]) {
  const results = await invoke<CoverColorResult[]>('compute_cover_colors', { items: batch });
  const computed: Record<string, CoverColor | null> = Object.fromEntries(batch.map((item) => [item.albumId, null]));
  for (const { albumId, hue, saturation, lightness } of results) computed[albumId] = { hue, saturation, lightness };

  try {
    await useLocalDb().saveCoverColors(computed);
  } catch (err) {
    console.error('Failed to save cover colors:', err);
  }

  const now = Date.now();
  const found: Record<string, CoverColor> = {};
  for (const [albumId, color] of Object.entries(computed)) {
    if (color) found[albumId] = color;
    else failedColorAttempts.set(albumId, now);
  }
  coverColors.value = { ...coverColors.value, ...found };
}

async function runColorJob() {
  await loadContext();
  computingColors.value = true;
  try {
    while (pendingColorAlbums) {
      const items = missingColorItems(pendingColorAlbums);
      pendingColorAlbums = null;
      colorProgress.value = { done: 0, total: items.length };
      for (let i = 0; i < items.length; i += COLOR_BATCH_SIZE) {
        if (!collectionSortNeedsCoverColors(config.value)) return;
        const batch = items.slice(i, i + COLOR_BATCH_SIZE);
        await computeColorBatch(batch);
        colorProgress.value = { done: i + batch.length, total: items.length };
      }
    }
  } catch (err) {
    console.error('Failed to compute cover colors:', err);
  } finally {
    computingColors.value = false;
  }
}

function ensureCoverColors(albums: readonly NormalizedAlbum[]): Promise<void> {
  pendingColorAlbums = albums;
  if (!colorJob) colorJob = runColorJob().finally(() => {
    colorJob = null;
  });
  return colorJob;
}

export default function useCollectionSort(albums: MaybeRefOrGetter<readonly NormalizedAlbum[]> = []) {
  const context = computed<CollectionSortContext>(() => ({
    coverColors: coverColors.value,
    manualOrder: manualOrder.value,
    artistSortNames: artistSortNames.value,
  }));
  const needsCoverColors = computed(() => collectionSortNeedsCoverColors(config.value));
  const sorted = computed(() => sortCollection(toValue(albums), config.value, context.value));
  const grouped = computed(() => groupCollection(sorted.value, config.value, context.value));

  void loadContext();

  watch([needsCoverColors, () => toValue(albums)], ([needed, list]) => {
    if (needed && list.length > 0) void ensureCoverColors(list);
  }, { immediate: true });

  return {
    config,
    presets: COLLECTION_SORT_PRESETS,
    sorted,
    grouped,
    coverColors,
    manualOrder,
    artistSortNames,
    contextLoaded,
    computingColors,
    colorProgress,
    needsCoverColors,
    applyPreset,
    setRules,
    setGroupBy,
    setOption,
    resetConfig,
    loadContext,
    saveManualOrder,
    setArtistSortName,
    removeArtistSortName,
    ensureCoverColors,
  };
}
