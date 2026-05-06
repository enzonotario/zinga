<script lang="ts" setup>
interface ColumnConfig {
  width?: string
}
const props = withDefaults(
  defineProps<{
    columns: number
    rows?: number
    columnWidths?: string[]
    firstColumnThumb?: boolean
    ui?: {
      th?: string
      td?: string
      tr?: string
    }
  }>(),
  {
    rows: 10,
    columnWidths: () => [],
    firstColumnThumb: true,
    ui: () => ({}),
  },
);
const columnConfig = computed((): ColumnConfig[] => {
  const { columns, columnWidths } = props;
  return Array.from({ length: columns }, (_, i) => ({
    width: columnWidths[i],
  }));
});
const thClass = computed(() => props.ui?.th ?? 'py-3');
const tdClass = computed(() => props.ui?.td ?? 'py-2');
const trClass = computed(() => props.ui?.tr ?? '');
</script>

<template>
  <div class="w-full overflow-x-auto">
    <table class="w-full table-auto border-collapse">
      <thead>
        <tr :class="trClass">
          <th
            v-for="(col, c) in columnConfig"
            :key="c"
            :class="[thClass, c === 0 && firstColumnThumb ? 'w-10' : col.width]"
            class="text-left font-medium text-muted"
          >
            <USkeleton
              :class="
                c === 0 && firstColumnThumb
                  ? 'h-4 w-10'
                  : (col.width ?? 'h-4 w-full max-w-32')
              "
            />
          </th>
        </tr>
      </thead>
      <tbody>
        <tr
          v-for="r in rows"
          :key="r"
          :class="trClass"
        >
          <td
            v-for="(col, c) in columnConfig"
            :key="c"
            :class="[tdClass, c === 0 && firstColumnThumb ? 'w-10' : col.width]"
          >
            <USkeleton
              :class="
                c === 0 && firstColumnThumb
                  ? 'h-10 w-10 shrink-0 rounded'
                  : (col.width ?? 'h-4 w-full max-w-24')
              "
            />
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>
