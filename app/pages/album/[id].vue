<script lang="ts" setup>
definePageMeta({
  layout: 'default',
});
const route = useRoute();
const albumId = computed(() => route.params.id as string);
</script>

<template>
  <div class="py-6">
    <ProviderAlbumView :album-id="albumId" />
  </div>
</template>
