<script setup lang="ts">
import { computed } from "vue";
import type { NumberLineParams } from "@learn/shared";

const props = defineProps<{ params: NumberLineParams }>();

const step = computed(() => props.params.step ?? 1);
const ticks = computed(() => {
  const result: number[] = [];
  for (let n = props.params.min; n <= props.params.max; n += step.value) {
    result.push(n);
  }
  return result;
});

const width = 400;
const padding = 30;
const lineY = 50;
const range = computed(() => props.params.max - props.params.min || 1);

function x(n: number) {
  return padding + ((n - props.params.min) / range.value) * (width - 2 * padding);
}
</script>

<template>
  <svg :viewBox="`0 0 ${width} 100`" class="w-full max-w-md" role="img" aria-label="Number line">
    <!-- Main line -->
    <line :x1="padding - 5" :y1="lineY" :x2="width - padding + 5" :y2="lineY" stroke="#374151" stroke-width="2" />
    <!-- Arrow heads -->
    <polygon :points="`${width - padding + 5},${lineY} ${width - padding - 2},${lineY - 4} ${width - padding - 2},${lineY + 4}`" fill="#374151" />

    <!-- Ticks and labels -->
    <g v-for="n in ticks" :key="n">
      <line :x1="x(n)" :y1="lineY - 6" :x2="x(n)" :y2="lineY + 6" stroke="#374151" stroke-width="1.5" />
      <text :x="x(n)" :y="lineY + 20" text-anchor="middle" font-size="12" fill="#374151">{{ n }}</text>
    </g>

    <!-- Highlighted points -->
    <circle
      v-for="(h, i) in params.highlights ?? []"
      :key="`h-${i}`"
      :cx="x(h)" :cy="lineY" r="5"
      fill="#3B82F6" stroke="white" stroke-width="1.5"
    />

    <!-- Jumps (arcs) -->
    <g v-for="(jump, i) in params.jumps ?? []" :key="`j-${i}`">
      <path
        :d="`M ${x(jump.from)} ${lineY - 8} Q ${(x(jump.from) + x(jump.to)) / 2} ${lineY - 30} ${x(jump.to)} ${lineY - 8}`"
        fill="none" stroke="#3B82F6" stroke-width="1.5" marker-end="url(#arrowhead)"
      />
      <text
        v-if="jump.label"
        :x="(x(jump.from) + x(jump.to)) / 2" :y="lineY - 30"
        text-anchor="middle" font-size="10" fill="#3B82F6"
      >{{ jump.label }}</text>
    </g>

    <!-- Arrow marker def -->
    <defs>
      <marker id="arrowhead" markerWidth="6" markerHeight="4" refX="5" refY="2" orient="auto">
        <polygon points="0 0, 6 2, 0 4" fill="#3B82F6" />
      </marker>
    </defs>
  </svg>
</template>
