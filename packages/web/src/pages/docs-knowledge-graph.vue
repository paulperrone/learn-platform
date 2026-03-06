<script setup lang="ts">
import { RouterLink } from "vue-router";
import { onMounted } from "vue";

onMounted(() => {
  document.title = "The Knowledge Graph Approach — Learn Platform";

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

  setMeta("description", "Why a directed graph of prerequisites beats a linear curriculum, and how it enables personalized learning paths, targeted remediation, and review compression.");
  setMeta("og:title", "The Knowledge Graph Approach — Learn Platform", true);
  setMeta("og:description", "How a knowledge graph enables personalized learning paths and targeted remediation.", true);
  setMeta("og:type", "article", true);
});
</script>

<template>
  <div class="max-w-3xl mx-auto">
    <div class="mb-4">
      <RouterLink to="/docs" class="text-sm text-blue-600 hover:text-blue-800">&larr; All articles</RouterLink>
    </div>

    <h1 class="text-4xl font-bold text-gray-900 mb-4">The Knowledge Graph Approach</h1>
    <p class="text-lg text-gray-500 mb-10">Why a directed graph of prerequisites beats a linear curriculum.</p>

    <!-- The Problem with Linear -->
    <section class="mb-12">
      <h2 class="text-2xl font-bold text-gray-900 mb-4">The problem with linear curricula</h2>
      <p class="text-gray-700 leading-relaxed mb-4">
        Traditional textbooks and courses organize math linearly: Chapter 1, Chapter 2,
        Chapter 3. Everyone moves through the same sequence at the same pace. This creates
        two fundamental problems:
      </p>
      <div class="space-y-3 mb-4">
        <div class="bg-white border border-gray-200 rounded-lg p-4">
          <p class="text-gray-700 text-sm leading-relaxed">
            <strong>Gap accumulation.</strong> If a student doesn't fully understand Chapter 3
            but the class moves on, Chapter 6 (which depends on Chapter 3) becomes impossible.
            The gap compounds. Research shows that 38–49% of students in any grade classroom
            are either below or above "grade level" (Pedersen et al., 2023).
          </p>
        </div>
        <div class="bg-white border border-gray-200 rounded-lg p-4">
          <p class="text-gray-700 text-sm leading-relaxed">
            <strong>Rigid sequencing.</strong> A student who already knows addition but
            struggles with measurement is forced through both at the same pace. Linear
            curricula can't express that these are independent — a student could safely
            advance in one while remediating the other.
          </p>
        </div>
      </div>
      <cite class="block text-sm text-gray-500">
        Pedersen, B. et al. (2023). Academic diversity within classrooms. | Arzi, H.J., Ben-Zvi, R., & Ganiel, U. (1985). Hierarchical learning sequences.
      </cite>
    </section>

    <!-- What Is a Knowledge Graph -->
    <section class="mb-12">
      <h2 class="text-2xl font-bold text-gray-900 mb-4">What a knowledge graph is</h2>
      <p class="text-gray-700 leading-relaxed mb-4">
        A knowledge graph is a <strong>directed acyclic graph (DAG)</strong> where each node
        is a topic and each edge represents a dependency. "Add within 20" requires "Add
        within 10" as a prerequisite. "Multiply within 100" requires both "Times tables" and
        "Place value." The graph makes these relationships explicit and machine-readable.
      </p>

      <div class="bg-gray-50 border border-gray-200 rounded-lg p-6 mb-4">
        <p class="text-sm text-gray-500 mb-4 font-medium">Linear vs. graph-based sequencing</p>
        <div class="grid md:grid-cols-2 gap-6">
          <div>
            <p class="text-xs font-medium text-gray-500 mb-2">LINEAR (textbook)</p>
            <div class="flex flex-col gap-2 text-sm">
              <span class="bg-gray-100 border border-gray-200 rounded px-3 py-1.5 text-center">Ch 1: Counting</span>
              <span class="text-gray-400 text-center">&darr;</span>
              <span class="bg-gray-100 border border-gray-200 rounded px-3 py-1.5 text-center">Ch 2: Addition</span>
              <span class="text-gray-400 text-center">&darr;</span>
              <span class="bg-gray-100 border border-gray-200 rounded px-3 py-1.5 text-center">Ch 3: Subtraction</span>
              <span class="text-gray-400 text-center">&darr;</span>
              <span class="bg-gray-100 border border-gray-200 rounded px-3 py-1.5 text-center">Ch 4: Measurement</span>
            </div>
            <p class="text-xs text-gray-500 mt-2">One path. Everyone follows it.</p>
          </div>
          <div>
            <p class="text-xs font-medium text-gray-500 mb-2">GRAPH (our approach)</p>
            <div class="text-sm space-y-2">
              <div class="text-center">
                <span class="bg-blue-50 border border-blue-200 rounded px-3 py-1.5 inline-block">Counting</span>
              </div>
              <div class="flex justify-center gap-6 text-gray-400 text-xs">
                <span>&swarr;</span>
                <span>&searr;</span>
              </div>
              <div class="flex justify-center gap-3">
                <span class="bg-blue-50 border border-blue-200 rounded px-3 py-1.5">Addition</span>
                <span class="bg-blue-50 border border-blue-200 rounded px-3 py-1.5">Measurement</span>
              </div>
              <div class="flex justify-center text-gray-400 text-xs">
                <span>&darr;</span>
              </div>
              <div class="text-center">
                <span class="bg-blue-50 border border-blue-200 rounded px-3 py-1.5 inline-block">Subtraction</span>
              </div>
            </div>
            <p class="text-xs text-gray-500 mt-2">Multiple paths. Measurement is independent.</p>
          </div>
        </div>
      </div>

      <p class="text-gray-700 leading-relaxed mb-4">
        Our Foundational Mathematics graph contains <strong>71 topics</strong>, <strong>108 prerequisite
        edges</strong>, and <strong>16 encompassing edges</strong> (for FIRe credit), all
        aligned to Common Core standards. You can
        <RouterLink to="/explore" class="text-blue-600 underline">browse the full graph</RouterLink>.
      </p>
    </section>

    <!-- Three Relationship Types -->
    <section class="mb-12">
      <h2 class="text-2xl font-bold text-gray-900 mb-4">Three types of relationships</h2>
      <div class="space-y-4 mb-6">
        <div class="bg-white border border-gray-200 rounded-lg p-5">
          <h3 class="font-semibold text-gray-900 mb-2">1. Prerequisites</h3>
          <p class="text-gray-600 text-sm leading-relaxed">
            "Must learn A before B." The DAG edges. A student only encounters a topic when
            all its prerequisites are mastered. Research shows students are <strong>3–4x more
            likely to master a topic</strong> when working at their knowledge frontier
            (Zou et al., 2019).
          </p>
        </div>
        <div class="bg-white border border-gray-200 rounded-lg p-5">
          <h3 class="font-semibold text-gray-900 mb-2">2. Key prerequisites</h3>
          <p class="text-gray-600 text-sm leading-relaxed">
            When a student struggles with a specific knowledge point, the key prerequisite
            identifies exactly which foundational skill is causing the difficulty. This enables
            <strong>pinpoint remediation</strong> — sending the student to strengthen one
            specific prerequisite rather than starting over.
          </p>
        </div>
        <div class="bg-white border border-gray-200 rounded-lg p-5">
          <h3 class="font-semibold text-gray-900 mb-2">3. Encompassings</h3>
          <p class="text-gray-600 text-sm leading-relaxed">
            "Practicing B implicitly practices A." Advanced topics encompass simpler ones.
            Numerical weights (0–1) represent the fraction of the simpler skill exercised.
            This powers
            <RouterLink to="/docs/spaced-repetition" class="text-blue-600 underline">FIRe credit</RouterLink>,
            dramatically reducing the total number of reviews needed.
          </p>
        </div>
      </div>

      <cite class="block text-sm text-gray-500">
        Zou, D. et al. (2019). Students at their knowledge frontier are 3-4x more likely to master topics.
      </cite>
    </section>

    <!-- Graph Traversal -->
    <section class="mb-12">
      <h2 class="text-2xl font-bold text-gray-900 mb-4">How we traverse the graph</h2>
      <p class="text-gray-700 leading-relaxed mb-4">
        We don't use pure depth-first or breadth-first traversal. Instead, we use a
        <strong>layered approach</strong>: teach a layer of foundational concepts across the
        breadth of the graph, then deepen. This serves two purposes:
      </p>
      <div class="space-y-3 mb-4">
        <div class="flex items-start gap-3">
          <span class="bg-blue-100 text-blue-700 font-bold rounded-full w-6 h-6 flex items-center justify-center shrink-0 text-xs">1</span>
          <p class="text-gray-700 text-sm leading-relaxed">
            <strong>Interleaving.</strong> Working across multiple areas simultaneously means
            each session mixes dissimilar concepts, which research shows doubles retention
            compared to blocked practice.
          </p>
        </div>
        <div class="flex items-start gap-3">
          <span class="bg-blue-100 text-blue-700 font-bold rounded-full w-6 h-6 flex items-center justify-center shrink-0 text-xs">2</span>
          <p class="text-gray-700 text-sm leading-relaxed">
            <strong>Non-interference.</strong> Conceptually similar topics taught back-to-back
            cause interference — 50–90% of multiplication errors are caused by interference
            from related facts (Campbell, 1987). Spacing related concepts across sessions
            reduces this.
          </p>
        </div>
      </div>
      <p class="text-gray-700 leading-relaxed">
        The result: students see a varied, engaging mix of topics in each session while
        maintaining strict prerequisite ordering.
      </p>
    </section>

    <!-- Targeted Remediation -->
    <section class="mb-12">
      <h2 class="text-2xl font-bold text-gray-900 mb-4">Targeted remediation through the graph</h2>
      <p class="text-gray-700 leading-relaxed mb-4">
        When a student struggles, the graph enables precise diagnosis. Instead of repeating
        the failed topic, the system traces prerequisite edges to find the <strong>specific
        foundational gap</strong>. A student struggling with two-digit addition might not
        lack addition skills at all — they might have a shaky understanding of place value.
      </p>
      <p class="text-gray-700 leading-relaxed mb-4">
        The system sends them to strengthen that specific prerequisite, then returns them to
        the original topic. Crucially, being stuck on one branch of the graph doesn't block
        progress on independent branches — the student can continue advancing on unrelated
        topics while the gap is being repaired.
      </p>

      <div class="bg-green-50 border border-green-200 rounded-lg p-5 mb-4">
        <p class="text-sm font-semibold text-green-800 mb-2">Four types of remediation</p>
        <ul class="text-sm text-green-900 space-y-1">
          <li><strong>Corrective:</strong> Immediate response to struggle on a specific task</li>
          <li><strong>Preventative:</strong> Predicted difficulty based on learning speed patterns</li>
          <li><strong>Foundational:</strong> Diagnostic reveals missing below-grade prerequisites</li>
          <li><strong>Content:</strong> If many students fail a topic, the content is refined (more scaffolding, intermediate steps)</li>
        </ul>
      </div>
    </section>

    <!-- References -->
    <section class="mb-12">
      <h2 class="text-2xl font-bold text-gray-900 mb-4">References</h2>
      <div class="bg-gray-50 border border-gray-200 rounded-lg p-6">
        <ul class="space-y-2 text-sm text-gray-700">
          <li>Zou, D. et al. (2019). Students are 3-4x more likely to master frontier topics.</li>
          <li>Pedersen, B. et al. (2023). Academic diversity within classrooms.</li>
          <li>Arzi, H.J., Ben-Zvi, R., & Ganiel, U. (1985). "Hierarchical learning sequences." <em>Studies in Science Education</em>.</li>
          <li>Campbell, J.I.D. (1987). "Production, verification, and priming of multiplication facts." <em>Memory & Cognition</em>.</li>
          <li>Underwood, B.J. & Ekstrand, B.R. (1967). "Linguistic associations and retention." <em>Journal of Verbal Learning and Verbal Behavior</em>.</li>
          <li>Taylor, K. & Rohrer, D. (2010). "The effects of interleaved practice." <em>Applied Cognitive Psychology</em>.</li>
          <li>Skycak, J. (2026). <em>The Math Academy Way</em>.</li>
        </ul>
      </div>
    </section>

    <div class="flex justify-between items-center py-8 border-t border-gray-200">
      <RouterLink to="/docs/spaced-repetition" class="text-blue-600 hover:text-blue-800">&larr; How Spaced Repetition Optimizes Memory</RouterLink>
      <RouterLink to="/docs/ai-tutoring" class="text-blue-600 hover:text-blue-800">AI Tutoring Done Right &rarr;</RouterLink>
    </div>
  </div>
</template>
