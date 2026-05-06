# Zinga Development Guidelines

## Stack

- **Framework**: Nuxt 3 (Vue 3 Composition API)
- **UI**: Nuxt UI v4 (components like UButton, UCard, UModal, UAlert, UBadge, etc.)
- **Desktop**: Tauri (Rust backend)
- **Language**: TypeScript
- **Streaming**: Tidal API + Mopidy + UPnP

## Project Structure

```
app/
├── components/     # Vue components organized by feature
│   ├── Tidal/      # Tidal-specific views (ArtistView, AlbumView, etc.)
│   ├── Nav/        # Navigation components
│   ├── Ui/         # Reusable UI components
│   └── ...
├── composables/    # Reusable logic (useTidalAuth, usePlayer, etc.)
├── pages/          # Nuxt pages (file-based routing)
├── layouts/        # Page layouts
├── utils/          # Utility functions
├── types/          # TypeScript type definitions
└── constants/      # Application constants
```

## Code Style

### General

- Write self-documenting code - no unnecessary comments
- Remove JSDoc comments unless they provide non-obvious information
- Use early returns to reduce nesting
- Extract repeated logic into helper functions
- Keep functions small and focused

### TypeScript

```typescript
// Prefer function declarations for named functions
function loadData() {
  // ...
}

// Use arrow functions for callbacks and inline functions
items.map((item) => item.id);

// Use optional chaining and nullish coalescing
const name = artist.value?.attributes?.name || 'Unknown';

// Prefix unused parameters with underscore
const search = async (query: string, _limit = 10) => { };
```

### Vue Components

```vue
<script lang="ts" setup>
// Imports first
import { computed, ref, watch } from 'vue'
import useComposable from '~/composables/useComposable'

// Props and emits
interface Props {
  id: string
  countryCode?: string
}
const props = withDefaults(defineProps<Props>(), {
  countryCode: 'US',
})

// Composables
const { data, loading } = useComposable()

// State - group related refs together, no section comments
const isOpen = ref(false)
const error = ref<string | null>(null)

// Computed properties
const formattedData = computed(() => /* ... */)

// Functions
async function loadData() {
  // ...
}

// Lifecycle and watchers at the end
onMounted(() => loadData())
watch(() => props.id, () => loadData())
</script>
```

### Composables

```typescript
// composables/useExample.ts
import { computed, ref } from 'vue';

const globalState = ref<string | null>(null); // Shared state outside function

export default function useExample() {
  function doSomething() {
    // ...
  }

  return {
    globalState,
    doSomething,
  };
}
```

## Patterns

### Tidal API Data

Tidal API returns data with `relationships` and `included` arrays. Always merge them:

```typescript
const result = await tidalAuth.getArtist(id, countryCode, ['profileArt']);
const artistWithIncluded = {
  ...result.data,
  included: result.included || [],
};
```

### Error Handling

```typescript
try {
  await apiCall();
} catch (err) {
  error.value = err instanceof Error ? err.message : 'Error message';
  console.error('Context:', err);
}
```

### Loading States

```typescript
const loading = ref(false);

async function load() {
  loading.value = true;
  try {
    // ...
  } finally {
    loading.value = false;
  }
}
```

### Caching

Use in-memory cache for expensive operations:

```typescript
const cache = new Map<string, any>();

function getCached(key: string) {
  return cache.get(key) || null;
}

function setCached(key: string, data: any) {
  cache.set(key, data);
}
```

## UI Components

Use Nuxt UI v4 components:

```vue
<!-- Buttons: always use variant="ghost", except for primary actions (default variant) -->
<UButton icon="i-heroicons-play" variant="ghost" :loading="loading">
  Play
</UButton>

<!-- Cards -->
<UCard>
  <template #header>Title</template>
  Content
</UCard>

<!-- Alerts -->
<UAlert v-if="error" color="error" :title="error" />

<!-- Loading -->
<UIcon name="i-heroicons-arrow-path" class="animate-spin" />

<!-- Empty states -->
<UEmpty icon="i-heroicons-musical-note" title="No data" />
```

## Language

- **UI text**: Spanish (es-AR)
- **Code**: English (variable names, function names, comments if any)
- **Git commits**: English

## After Making Changes

Always run lint after modifying code:

```bash
pnpm lint        # Check for issues
pnpm lint:fix    # Auto-fix issues
```

## Tauri (Rust ↔ TypeScript)

- Rust structs returned to the frontend via `#[tauri::command]` must use `#[serde(rename_all = "camelCase")]` when they have multi-word fields (e.g. `model_name` → `modelName`). TypeScript interfaces use camelCase, Rust uses snake_case — serde won't convert automatically without this attribute.
- Single-word fields (`id`, `name`, `ip`) are unaffected, so the mismatch only surfaces when adding multi-word fields.
- When launching external processes from Tauri/AppImage (Mopidy, ffmpeg, scripts, tmux sessions), sanitize the environment first. AppImage runtime variables can break system GStreamer/PulseAudio resolution and make Mopidy audio fail at startup.
- Remove AppImage/runtime-sensitive vars before spawning scripts/processes: `APPDIR`, `APPIMAGE`, `APPIMAGE_SILENT_INSTALL`, `ARGV0`, `LD_LIBRARY_PATH`, `GST_PLUGIN_SYSTEM_PATH`, `GST_PLUGIN_SYSTEM_PATH_1_0`, `GIO_EXTRA_MODULES`, `GDK_PIXBUF_MODULE_FILE`, `GTK_*`, `QT_PLUGIN_PATH`, `GSETTINGS_SCHEMA_DIR`, plus Python overrides (`PYTHONHOME`, `PYTHONPATH`).
- If playback fails after restarting services in production builds, check `/tmp/mopidy.log` first. Errors like `playbin` being `None` or `ActorDeadError: Audio ... not found` usually indicate a contaminated runtime environment.

## Don'ts

- Don't add comments that repeat what the code does
- Don't use `// Estado`, `// Loading`, etc. section comments
- Don't leave console.logs for debugging
- Don't over-engineer - keep it simple
- Don't add features that weren't requested
- Don't create abstractions for one-time operations
