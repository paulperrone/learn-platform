<script setup lang="ts">
import { onMounted } from "vue";
import { useMeta } from "@/composables/useMeta";

onMounted(() => {
  useMeta({
    title: "Content License",
    description: "Learn Platform curriculum content is licensed under Creative Commons Attribution 4.0 International (CC BY 4.0). Free to use, share, and adapt with attribution.",
  });
});
</script>

<template>
  <div class="max-w-3xl mx-auto">
    <h1 class="text-3xl font-bold text-gray-900 mb-2">Content License</h1>
    <p class="text-gray-600 text-lg mb-8">
      Our curriculum content is free to use, share, and adapt.
    </p>

    <!-- License badge -->
    <div class="bg-white rounded-lg border border-gray-200 p-6 mb-8">
      <div class="flex items-start gap-4">
        <div class="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center shrink-0">
          <svg class="w-6 h-6 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>
        <div>
          <h2 class="text-xl font-semibold text-gray-900 mb-1">Creative Commons Attribution 4.0 International</h2>
          <p class="text-sm text-gray-500 mb-3">CC BY 4.0</p>
          <p class="text-gray-700">
            All curriculum content — including the knowledge graph, problems, worked examples, and prerequisite structures —
            is licensed under
            <a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noopener" class="text-blue-600 hover:underline">CC BY 4.0</a>.
          </p>
        </div>
      </div>
    </div>

    <!-- What you can do -->
    <h2 class="text-xl font-semibold text-gray-900 mb-4">What you can do</h2>
    <div class="grid gap-4 sm:grid-cols-2 mb-8">
      <div class="bg-green-50 border border-green-200 rounded-lg p-4">
        <h3 class="font-medium text-green-800 mb-2">Share</h3>
        <p class="text-sm text-green-700">Copy and redistribute the content in any medium or format.</p>
      </div>
      <div class="bg-green-50 border border-green-200 rounded-lg p-4">
        <h3 class="font-medium text-green-800 mb-2">Adapt</h3>
        <p class="text-sm text-green-700">Remix, transform, and build upon the content for any purpose, including commercial.</p>
      </div>
      <div class="bg-green-50 border border-green-200 rounded-lg p-4">
        <h3 class="font-medium text-green-800 mb-2">Build tools</h3>
        <p class="text-sm text-green-700">Use the content in your own apps, tools, or educational platforms.</p>
      </div>
      <div class="bg-green-50 border border-green-200 rounded-lg p-4">
        <h3 class="font-medium text-green-800 mb-2">Teach</h3>
        <p class="text-sm text-green-700">Use problems and examples in classrooms, tutoring, or homeschool.</p>
      </div>
    </div>

    <!-- Attribution requirement -->
    <h2 class="text-xl font-semibold text-gray-900 mb-4">Attribution requirement</h2>
    <div class="bg-blue-50 border border-blue-200 rounded-lg p-5 mb-8">
      <p class="text-blue-900 mb-3">
        When using our content, please provide attribution. A simple credit like this is sufficient:
      </p>
      <div class="bg-white border border-blue-200 rounded px-4 py-3 font-mono text-sm text-gray-800">
        Content from <a href="https://github.com/paulperrone/learn-platform" class="text-blue-600">Learn Platform</a>, licensed under <a href="https://creativecommons.org/licenses/by/4.0/" class="text-blue-600">CC BY 4.0</a>.
      </div>
    </div>

    <!-- What's covered -->
    <h2 class="text-xl font-semibold text-gray-900 mb-4">What's covered</h2>
    <div class="bg-white rounded-lg border border-gray-200 divide-y divide-gray-200 mb-8">
      <div class="p-4 flex items-center gap-3">
        <span class="text-green-500 font-bold">CC BY 4.0</span>
        <span class="text-gray-700">Knowledge graph (topics, prerequisites, encompassing relationships)</span>
      </div>
      <div class="p-4 flex items-center gap-3">
        <span class="text-green-500 font-bold">CC BY 4.0</span>
        <span class="text-gray-700">Practice problems (questions, answers, hints, solutions)</span>
      </div>
      <div class="p-4 flex items-center gap-3">
        <span class="text-green-500 font-bold">CC BY 4.0</span>
        <span class="text-gray-700">Worked examples (step-by-step solutions with explanations)</span>
      </div>
      <div class="p-4 flex items-center gap-3">
        <span class="text-green-500 font-bold">CC BY 4.0</span>
        <span class="text-gray-700">Downloadable content packs</span>
      </div>
      <div class="p-4 flex items-center gap-3">
        <span class="text-gray-400 font-bold">Separate</span>
        <span class="text-gray-500">Platform software (see repository LICENSE for code)</span>
      </div>
    </div>

    <!-- Download -->
    <h2 class="text-xl font-semibold text-gray-900 mb-4">Download content</h2>
    <p class="text-gray-600 mb-4">
      Download the complete curriculum as a single JSON file.
      Content packs include the full knowledge graph, all problems, and all worked examples.
    </p>
    <a
      href="/api/public/download/math-k5"
      class="inline-flex items-center gap-2 rounded-md bg-blue-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-blue-700 transition-colors"
    >
      <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
        <path stroke-linecap="round" stroke-linejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
      </svg>
      Download Math K-5 Content Pack
    </a>

    <!-- API access -->
    <div class="mt-8 bg-gray-50 border border-gray-200 rounded-lg p-5">
      <h3 class="font-semibold text-gray-900 mb-1">Prefer an API?</h3>
      <p class="text-sm text-gray-600">
        All content is also available via our
        <a href="/api/public/schema" class="text-blue-600 hover:underline">public API</a>.
        No authentication required. Rate limits apply.
      </p>
    </div>
  </div>
</template>
