<script setup lang="ts">
import type { FractionBarParams } from "@learn/shared";

const props = defineProps<{ params: FractionBarParams }>();

const width = 300;
const barHeight = 40;
const gap = 12;
</script>

<template>
  <div role="img" :aria-label="`Fraction bar showing ${params.numerator}/${params.denominator}`">
    <svg :viewBox="`0 0 ${width} ${params.compare ? barHeight * 2 + gap + 30 : barHeight + 20}`" class="w-full max-w-sm">
      <!-- Primary fraction bar -->
      <g>
        <rect
          v-for="i in params.denominator" :key="`p-${i}`"
          :x="(i - 1) * (width / params.denominator)" y="0"
          :width="width / params.denominator" :height="barHeight"
          :fill="i <= params.numerator ? '#3B82F6' : '#F3F4F6'"
          stroke="#9CA3AF" stroke-width="1"
        />
        <text :x="width / 2" :y="barHeight + 16" text-anchor="middle" font-size="13" fill="#374151" font-weight="500">
          {{ params.numerator }}/{{ params.denominator }}
        </text>
      </g>

      <!-- Comparison bar -->
      <g v-if="params.compare" :transform="`translate(0, ${barHeight + gap})`">
        <rect
          v-for="i in params.compare.denominator" :key="`c-${i}`"
          :x="(i - 1) * (width / params.compare.denominator)" y="0"
          :width="width / params.compare.denominator" :height="barHeight"
          :fill="i <= params.compare.numerator ? '#F59E0B' : '#F3F4F6'"
          stroke="#9CA3AF" stroke-width="1"
        />
        <text :x="width / 2" :y="barHeight + 16" text-anchor="middle" font-size="13" fill="#374151" font-weight="500">
          {{ params.compare.numerator }}/{{ params.compare.denominator }}
        </text>
      </g>
    </svg>
  </div>
</template>
