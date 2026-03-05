<script setup lang="ts">
import type { VisualAsset, NumberLineParams, BaseTenBlocksParams, FractionBarParams, ArrayGridParams, PlaceValueChartParams } from "@learn/shared";
import NumberLine from "./NumberLine.vue";
import BaseTenBlocks from "./BaseTenBlocks.vue";
import FractionBar from "./FractionBar.vue";
import ArrayGrid from "./ArrayGrid.vue";
import PlaceValueChart from "./PlaceValueChart.vue";

defineProps<{ visuals: VisualAsset[] }>();
</script>

<template>
  <div v-if="visuals.length > 0" class="flex flex-col gap-3 items-center py-2">
    <div v-for="(v, i) in visuals" :key="i">
      <NumberLine v-if="v.type === 'number-line'" :params="(v.params as NumberLineParams)" />
      <BaseTenBlocks v-else-if="v.type === 'base-ten-blocks'" :params="(v.params as BaseTenBlocksParams)" />
      <FractionBar v-else-if="v.type === 'fraction-bar'" :params="(v.params as FractionBarParams)" />
      <ArrayGrid v-else-if="v.type === 'array-grid'" :params="(v.params as ArrayGridParams)" />
      <PlaceValueChart v-else-if="v.type === 'place-value-chart'" :params="(v.params as PlaceValueChartParams)" />
    </div>
  </div>
</template>
