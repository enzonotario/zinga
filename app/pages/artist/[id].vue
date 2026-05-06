<script lang="ts" setup>
definePageMeta({
  layout: 'default',
});
const route = useRoute();
const artistId = computed(() => route.params.id as string);
</script>

<template>
  <div class="py-6">
    <ProviderArtistView :artist-id="artistId" />
  </div>
</template>
