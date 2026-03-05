<script setup lang="ts">
import { computed } from "vue";
import type { BaseTenBlocksParams } from "@learn/shared";

const props = defineProps<{ params: BaseTenBlocksParams }>();

const hundreds = computed(() => props.params.hundreds ?? 0);
const tens = computed(() => props.params.tens ?? 0);
const ones = computed(() => props.params.ones ?? 0);

const total = computed(() => hundreds.value * 100 + tens.value * 10 + ones.value);
</script>

<template>
  <div class="flex flex-wrap items-end gap-4" role="img" :aria-label="`Base ten blocks showing ${total}`">
    <!-- Hundreds: 10x10 grids -->
    <div v-if="hundreds > 0" class="flex gap-2">
      <div v-for="h in hundreds" :key="`h-${h}`" class="flex flex-col">
        <svg viewBox="0 0 50 50" class="w-12 h-12">
          <rect x="1" y="1" width="48" height="48" fill="#DBEAFE" stroke="#3B82F6" stroke-width="1" rx="2" />
          <g v-for="r in 10" :key="r">
            <line :x1="1" :y1="r * 4.8 + 1" :x2="49" :y2="r * 4.8 + 1" stroke="#93C5FD" stroke-width="0.3" />
            <line :x1="r * 4.8 + 1" :y1="1" :x2="r * 4.8 + 1" :y2="49" stroke="#93C5FD" stroke-width="0.3" />
          </g>
        </svg>
        <span class="text-xs text-center text-gray-500">100</span>
      </div>
    </div>

    <!-- Tens: vertical rods -->
    <div v-if="tens > 0" class="flex gap-1">
      <div v-for="t in tens" :key="`t-${t}`" class="flex flex-col items-center">
        <svg viewBox="0 0 10 50" class="w-3 h-12">
          <rect x="1" y="1" width="8" height="48" fill="#BBF7D0" stroke="#22C55E" stroke-width="1" rx="1" />
          <line v-for="r in 9" :key="r" :x1="1" :y1="r * 4.8 + 1" :x2="9" :y2="r * 4.8 + 1" stroke="#86EFAC" stroke-width="0.3" />
        </svg>
        <span class="text-xs text-gray-500">10</span>
      </div>
    </div>

    <!-- Ones: small cubes -->
    <div v-if="ones > 0" class="flex gap-0.5 flex-wrap max-w-[64px]">
      <div v-for="o in ones" :key="`o-${o}`">
        <svg viewBox="0 0 10 10" class="w-3 h-3">
          <rect x="1" y="1" width="8" height="8" fill="#FEF08A" stroke="#EAB308" stroke-width="1" rx="1" />
        </svg>
      </div>
    </div>

    <!-- Total label -->
    <span class="text-sm font-medium text-gray-600 self-center ml-2">= {{ total }}</span>
  </div>
</template>
