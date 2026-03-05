<script setup lang="ts">
import type { ArrayGridParams } from "@learn/shared";

const props = defineProps<{ params: ArrayGridParams }>();

const dotSize = 20;
const gap = 6;
</script>

<template>
  <div role="img" :aria-label="`Array grid: ${params.rows} rows by ${params.cols} columns`">
    <svg
      :viewBox="`0 0 ${params.cols * (dotSize + gap) + gap} ${params.rows * (dotSize + gap) + gap + 20}`"
      class="w-full max-w-xs"
    >
      <template v-for="r in params.rows" :key="`row-${r}`">
        <circle
          v-for="c in params.cols" :key="`${r}-${c}`"
          :cx="gap + (c - 1) * (dotSize + gap) + dotSize / 2"
          :cy="gap + (r - 1) * (dotSize + gap) + dotSize / 2"
          :r="dotSize / 2 - 1"
          :fill="
            (params.highlightRows && r <= params.highlightRows) ||
            (params.highlightCols && c <= params.highlightCols)
              ? '#3B82F6'
              : '#93C5FD'
          "
          stroke="#2563EB" stroke-width="0.5"
        />
      </template>

      <!-- Label -->
      <text
        :x="(params.cols * (dotSize + gap) + gap) / 2"
        :y="params.rows * (dotSize + gap) + gap + 14"
        text-anchor="middle" font-size="13" fill="#374151" font-weight="500"
      >
        {{ params.rows }} x {{ params.cols }} = {{ params.rows * params.cols }}
      </text>
    </svg>
  </div>
</template>
