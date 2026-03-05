<script setup lang="ts">
import type { PlaceValueChartParams } from "@learn/shared";

const props = defineProps<{ params: PlaceValueChartParams }>();
</script>

<template>
  <div role="img" :aria-label="`Place value chart: ${params.digits.map(d => `${d.value} ${d.place}`).join(', ')}`">
    <table class="border-collapse mx-auto text-center">
      <thead>
        <tr>
          <th
            v-for="d in params.digits" :key="d.place"
            class="px-4 py-2 border border-gray-300 bg-blue-50 text-xs font-semibold text-blue-800 uppercase tracking-wide"
          >
            {{ d.place }}
          </th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td
            v-for="d in params.digits" :key="d.place"
            class="px-4 py-3 border border-gray-300 text-2xl font-bold text-gray-800"
          >
            {{ d.value }}
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>
