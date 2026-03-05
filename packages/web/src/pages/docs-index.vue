<script setup lang="ts">
import { RouterLink } from "vue-router";
import { onMounted } from "vue";

onMounted(() => {
  document.title = "Research & Methodology — Learn Platform";

  const setMeta = (name: string, content: string, property?: boolean) => {
    const attr = property ? "property" : "name";
    let el = document.querySelector(`meta[${attr}="${name}"]`) as HTMLMetaElement | null;
    if (!el) {
      el = document.createElement("meta");
      el.setAttribute(attr, name);
      document.head.appendChild(el);
    }
    el.content = content;
  };

  setMeta("description", "Deep-dive articles on the learning science behind Learn Platform: mastery learning, spaced repetition, knowledge graphs, and AI tutoring. Research citations included.");
  setMeta("og:title", "Research & Methodology — Learn Platform", true);
  setMeta("og:description", "How and why our platform works, backed by decades of learning science research.", true);
  setMeta("og:type", "website", true);
});

const articles = [
  {
    slug: "mastery-learning",
    title: "Why Mastery Learning Works",
    description: "Bloom's Two-Sigma Problem, mastery thresholds, and how individualized pacing produces 2x better outcomes than traditional classrooms.",
    tags: ["Bloom 1984", "Kulik et al. 1990"],
  },
  {
    slug: "spaced-repetition",
    title: "How Spaced Repetition Optimizes Memory",
    description: "The FSRS algorithm, forgetting curves, FIRe credit, and why your child remembers forever — not just for the test.",
    tags: ["Ebbinghaus 1885", "FSRS", "FIRe"],
  },
  {
    slug: "knowledge-graph",
    title: "The Knowledge Graph Approach",
    description: "Why a directed graph of prerequisites beats a linear curriculum, and how it enables personalized learning paths.",
    tags: ["Zou et al. 2019", "DAG", "Prerequisites"],
  },
  {
    slug: "ai-tutoring",
    title: "AI Tutoring Done Right",
    description: "Socratic method, progressive hints, budget controls, and why our AI guides thinking instead of giving answers.",
    tags: ["Socratic Method", "Worked Examples"],
  },
  {
    slug: "comparison",
    title: "Our Approach vs. Others",
    description: "An honest comparison with Khan Academy, Math Academy, and IXL — what we do differently and why.",
    tags: ["Comparison", "Methodology"],
  },
];
</script>

<template>
  <div class="max-w-4xl mx-auto">
    <div class="mb-12">
      <h1 class="text-4xl font-bold text-gray-900 mb-4">Research & Methodology</h1>
      <p class="text-xl text-gray-600 leading-relaxed">
        Deep-dive articles on the learning science that powers our platform. Every claim
        is backed by research citations you can verify yourself.
      </p>
    </div>

    <div class="bg-blue-50 border border-blue-200 rounded-xl p-6 mb-12">
      <p class="text-blue-800 leading-relaxed">
        Looking for a quick overview? Start with
        <RouterLink to="/how-we-teach" class="font-semibold text-blue-700 underline hover:text-blue-900">How We Teach</RouterLink>,
        our parent-friendly summary. These articles go deeper into the research and methodology.
      </p>
    </div>

    <div class="space-y-6">
      <RouterLink
        v-for="article in articles"
        :key="article.slug"
        :to="`/docs/${article.slug}`"
        class="block bg-white border border-gray-200 rounded-xl p-6 hover:border-blue-300 hover:shadow-sm transition-all"
      >
        <h2 class="text-xl font-bold text-gray-900 mb-2">{{ article.title }}</h2>
        <p class="text-gray-600 leading-relaxed mb-3">{{ article.description }}</p>
        <div class="flex flex-wrap gap-2">
          <span
            v-for="tag in article.tags"
            :key="tag"
            class="text-xs bg-gray-100 text-gray-600 rounded-full px-3 py-1"
          >{{ tag }}</span>
        </div>
      </RouterLink>
    </div>

    <div class="text-center py-12">
      <p class="text-gray-500 text-sm">
        All content is
        <RouterLink to="/license" class="text-blue-600 hover:text-blue-800 underline">CC BY 4.0</RouterLink>.
        Found an error? We welcome corrections.
      </p>
    </div>
  </div>
</template>
