<script setup lang="ts">
import { RouterLink } from "vue-router";
import { onMounted } from "vue";

onMounted(() => {
  document.title = "Our Approach vs. Others — Learn Platform";

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

  setMeta("description", "An honest comparison of Learn Platform with Khan Academy, Math Academy, and IXL. What we do differently and why — no marketing spin, just methodology differences.");
  setMeta("og:title", "Our Approach vs. Others — Learn Platform", true);
  setMeta("og:description", "Honest comparison with Khan Academy, Math Academy, and IXL — methodology differences, not marketing.", true);
  setMeta("og:type", "article", true);
});
</script>

<template>
  <div class="max-w-3xl mx-auto">
    <div class="mb-4">
      <RouterLink to="/docs" class="text-sm text-blue-600 hover:text-blue-800">&larr; All articles</RouterLink>
    </div>

    <h1 class="text-4xl font-bold text-gray-900 mb-4">Our Approach vs. Others</h1>
    <p class="text-lg text-gray-500 mb-10">An honest comparison — what we do differently and why.</p>

    <div class="bg-blue-50 border border-blue-200 rounded-xl p-6 mb-12">
      <p class="text-blue-800 leading-relaxed text-sm">
        This is not a marketing page. Every platform below is doing valuable work in education.
        We've learned from all of them. This comparison focuses on <strong>methodology differences</strong>
        that matter for learning outcomes — not features, UI, or brand.
      </p>
    </div>

    <!-- Comparison Table -->
    <section class="mb-12">
      <h2 class="text-2xl font-bold text-gray-900 mb-6">At a glance</h2>
      <div class="overflow-x-auto">
        <table class="w-full text-sm border border-gray-200 rounded-lg">
          <thead>
            <tr class="bg-gray-50">
              <th class="text-left p-3 font-medium text-gray-700 border-b">Feature</th>
              <th class="text-center p-3 font-medium text-gray-700 border-b">Learn Platform</th>
              <th class="text-center p-3 font-medium text-gray-700 border-b">Khan Academy</th>
              <th class="text-center p-3 font-medium text-gray-700 border-b">Math Academy</th>
              <th class="text-center p-3 font-medium text-gray-700 border-b">IXL</th>
            </tr>
          </thead>
          <tbody>
            <tr class="border-b">
              <td class="p-3 text-gray-700">Knowledge graph</td>
              <td class="p-3 text-center text-green-600 font-medium">Yes (DAG)</td>
              <td class="p-3 text-center text-gray-400">Partial</td>
              <td class="p-3 text-center text-green-600 font-medium">Yes (DAG)</td>
              <td class="p-3 text-center text-red-400">No</td>
            </tr>
            <tr class="border-b bg-gray-50">
              <td class="p-3 text-gray-700">Prerequisite enforcement</td>
              <td class="p-3 text-center text-green-600 font-medium">Strict</td>
              <td class="p-3 text-center text-gray-400">Suggested</td>
              <td class="p-3 text-center text-green-600 font-medium">Strict</td>
              <td class="p-3 text-center text-red-400">None</td>
            </tr>
            <tr class="border-b">
              <td class="p-3 text-gray-700">Spaced repetition</td>
              <td class="p-3 text-center text-green-600 font-medium">FSRS</td>
              <td class="p-3 text-center text-gray-400">Basic</td>
              <td class="p-3 text-center text-green-600 font-medium">Custom</td>
              <td class="p-3 text-center text-red-400">No</td>
            </tr>
            <tr class="border-b bg-gray-50">
              <td class="p-3 text-gray-700">FIRe credit</td>
              <td class="p-3 text-center text-green-600 font-medium">Yes</td>
              <td class="p-3 text-center text-red-400">No</td>
              <td class="p-3 text-center text-green-600 font-medium">Yes</td>
              <td class="p-3 text-center text-red-400">No</td>
            </tr>
            <tr class="border-b">
              <td class="p-3 text-gray-700">Interleaved reviews</td>
              <td class="p-3 text-center text-green-600 font-medium">Yes</td>
              <td class="p-3 text-center text-gray-400">Limited</td>
              <td class="p-3 text-center text-green-600 font-medium">Yes</td>
              <td class="p-3 text-center text-red-400">No</td>
            </tr>
            <tr class="border-b bg-gray-50">
              <td class="p-3 text-gray-700">AI tutoring</td>
              <td class="p-3 text-center text-green-600 font-medium">Socratic</td>
              <td class="p-3 text-center text-green-600 font-medium">Khanmigo</td>
              <td class="p-3 text-center text-red-400">No</td>
              <td class="p-3 text-center text-red-400">No</td>
            </tr>
            <tr class="border-b">
              <td class="p-3 text-gray-700">Content type</td>
              <td class="p-3 text-center text-gray-700">Problems + examples</td>
              <td class="p-3 text-center text-gray-700">Videos + practice</td>
              <td class="p-3 text-center text-gray-700">Problems + examples</td>
              <td class="p-3 text-center text-gray-700">Drill practice</td>
            </tr>
            <tr class="border-b bg-gray-50">
              <td class="p-3 text-gray-700">Open content</td>
              <td class="p-3 text-center text-green-600 font-medium">CC BY 4.0</td>
              <td class="p-3 text-center text-green-600 font-medium">Yes</td>
              <td class="p-3 text-center text-red-400">No</td>
              <td class="p-3 text-center text-red-400">No</td>
            </tr>
            <tr class="border-b">
              <td class="p-3 text-gray-700">Price</td>
              <td class="p-3 text-center text-gray-700">Free core / $5/mo AI</td>
              <td class="p-3 text-center text-gray-700">Free / $9.99/mo AI</td>
              <td class="p-3 text-center text-gray-700">$499/yr</td>
              <td class="p-3 text-center text-gray-700">$9.95/mo</td>
            </tr>
            <tr>
              <td class="p-3 text-gray-700">Target grades</td>
              <td class="p-3 text-center text-gray-700">K-5 (expanding)</td>
              <td class="p-3 text-center text-gray-700">K-14</td>
              <td class="p-3 text-center text-gray-700">4-college</td>
              <td class="p-3 text-center text-gray-700">K-12</td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>

    <!-- Khan Academy -->
    <section class="mb-12">
      <h2 class="text-2xl font-bold text-gray-900 mb-4">vs. Khan Academy</h2>
      <p class="text-gray-700 leading-relaxed mb-4">
        Khan Academy is the most well-known free learning platform in the world, and
        rightfully so — they've made quality education accessible to millions. Our
        philosophical approaches differ in a few key ways:
      </p>
      <div class="space-y-3 mb-4">
        <div class="bg-white border border-gray-200 rounded-lg p-4">
          <p class="text-sm text-gray-700 leading-relaxed">
            <strong>Active vs. passive learning.</strong> Khan Academy's core experience is
            video-first: watch a lecture, then practice. Research consistently shows that
            active problem-solving produces better outcomes than watching explanations
            (Freeman et al., 2014). Our platform leads with worked examples and practice,
            not video.
          </p>
        </div>
        <div class="bg-white border border-gray-200 rounded-lg p-4">
          <p class="text-sm text-gray-700 leading-relaxed">
            <strong>Prerequisite enforcement.</strong> Khan Academy suggests a learning order
            but doesn't enforce it. Students can skip ahead to any topic. Our knowledge graph
            strictly enforces prerequisites — students only see topics they're ready for.
            Research shows this 3–4x increases the chance of mastery (Zou et al., 2019).
          </p>
        </div>
        <div class="bg-white border border-gray-200 rounded-lg p-4">
          <p class="text-sm text-gray-700 leading-relaxed">
            <strong>Spaced repetition.</strong> Khan Academy has a basic mastery system but
            doesn't use a modern spaced repetition algorithm. Without algorithmic review
            scheduling, students "cram and forget" — passing unit tests but unable to do the
            same problems months later.
          </p>
        </div>
      </div>
      <p class="text-gray-700 leading-relaxed text-sm">
        <strong>What Khan does well:</strong> Enormous content library, excellent production
        quality, AP/SAT prep, international reach, teacher dashboard. If you need breadth
        of coverage beyond K-5 math, Khan Academy is an excellent resource.
      </p>
    </section>

    <!-- Math Academy -->
    <section class="mb-12">
      <h2 class="text-2xl font-bold text-gray-900 mb-4">vs. Math Academy</h2>
      <p class="text-gray-700 leading-relaxed mb-4">
        Math Academy is our primary inspiration. They pioneered the knowledge graph + FIRe +
        mastery learning + spaced repetition approach that we implement. We share the same
        learning science foundations. The differences are practical:
      </p>
      <div class="space-y-3 mb-4">
        <div class="bg-white border border-gray-200 rounded-lg p-4">
          <p class="text-sm text-gray-700 leading-relaxed">
            <strong>Price.</strong> Math Academy is $499/year. Our core platform is free.
            This isn't a commentary on Math Academy's value (it's excellent) — it reflects
            different business models. We believe the learning system itself should be free,
            with only compute-intensive AI features as paid upgrades.
          </p>
        </div>
        <div class="bg-white border border-gray-200 rounded-lg p-4">
          <p class="text-sm text-gray-700 leading-relaxed">
            <strong>Open content.</strong> Our curriculum, knowledge graph, and problem banks
            are open source (CC BY 4.0). Anyone can download, audit, fork, or build on them.
            Math Academy's content is proprietary.
          </p>
        </div>
        <div class="bg-white border border-gray-200 rounded-lg p-4">
          <p class="text-sm text-gray-700 leading-relaxed">
            <strong>AI tutoring.</strong> Math Academy relies on content quality and
            structured scaffolding alone (which works extremely well). We add AI tutoring
            for real-time help when students get stuck, providing the interactive
            "dialogue" component of Bloom's tutor model.
          </p>
        </div>
        <div class="bg-white border border-gray-200 rounded-lg p-4">
          <p class="text-sm text-gray-700 leading-relaxed">
            <strong>Target audience.</strong> Math Academy targets 4th grade through college.
            We focus on K-5, where the prerequisite structure is clearest and the intervention
            has the highest leverage on long-term outcomes.
          </p>
        </div>
      </div>
      <p class="text-gray-700 leading-relaxed text-sm">
        <strong>What Math Academy does well:</strong> Unmatched content quality (95%
        first-attempt pass rate after years of refinement), covers through university-level
        math, proven track record with real students. If your child is in 4th grade or above
        and you can afford it, Math Academy is outstanding.
      </p>
    </section>

    <!-- IXL -->
    <section class="mb-12">
      <h2 class="text-2xl font-bold text-gray-900 mb-4">vs. IXL</h2>
      <p class="text-gray-700 leading-relaxed mb-4">
        IXL is a widely used practice platform, popular in schools. The methodology
        differences are significant:
      </p>
      <div class="space-y-3 mb-4">
        <div class="bg-white border border-gray-200 rounded-lg p-4">
          <p class="text-sm text-gray-700 leading-relaxed">
            <strong>No knowledge graph.</strong> IXL organizes skills in a flat list by grade
            level. There's no enforced prerequisite ordering. A student can attempt any skill
            at any time, regardless of whether they have the foundations.
          </p>
        </div>
        <div class="bg-white border border-gray-200 rounded-lg p-4">
          <p class="text-sm text-gray-700 leading-relaxed">
            <strong>No spaced repetition.</strong> IXL uses a "SmartScore" that measures
            current proficiency but doesn't schedule future reviews. There's no mechanism to
            ensure long-term retention.
          </p>
        </div>
        <div class="bg-white border border-gray-200 rounded-lg p-4">
          <p class="text-sm text-gray-700 leading-relaxed">
            <strong>Blocked practice.</strong> Students practice one skill at a time (e.g.,
            20 multiplication problems in a row). This is the opposite of interleaved
            practice, which research shows doubles retention.
          </p>
        </div>
      </div>
      <p class="text-gray-700 leading-relaxed text-sm">
        <strong>What IXL does well:</strong> Massive skill coverage across subjects (not
        just math), standards alignment reporting for teachers, immediate feedback on each
        problem, diagnostic assessments. Good as a supplementary practice tool.
      </p>
    </section>

    <!-- What We Believe -->
    <section class="mb-12">
      <h2 class="text-2xl font-bold text-gray-900 mb-4">What we believe</h2>
      <p class="text-gray-700 leading-relaxed mb-4">
        We're building on decades of learning science research and the pioneering work of
        platforms like Math Academy. Our specific bets:
      </p>
      <div class="space-y-3">
        <div class="flex items-start gap-3">
          <span class="text-blue-500 mt-1 shrink-0">1.</span>
          <p class="text-gray-700 leading-relaxed">
            <strong>The learning system should be free.</strong> Knowledge graphs, spaced
            repetition, and mastery learning are too important to gate behind subscriptions.
            Only features that cost real money to run (AI) should be paid.
          </p>
        </div>
        <div class="flex items-start gap-3">
          <span class="text-blue-500 mt-1 shrink-0">2.</span>
          <p class="text-gray-700 leading-relaxed">
            <strong>Content should be open.</strong> Parents and educators should be able to
            inspect every problem, every example, and every prerequisite relationship. Trust
            requires transparency.
          </p>
        </div>
        <div class="flex items-start gap-3">
          <span class="text-blue-500 mt-1 shrink-0">3.</span>
          <p class="text-gray-700 leading-relaxed">
            <strong>AI enhances but doesn't replace structure.</strong> The knowledge graph
            and FSRS do the heavy lifting. AI tutoring helps at the edges — when a student
            needs real-time guidance that structured content can't provide.
          </p>
        </div>
        <div class="flex items-start gap-3">
          <span class="text-blue-500 mt-1 shrink-0">4.</span>
          <p class="text-gray-700 leading-relaxed">
            <strong>Start young, start right.</strong> K-5 is where foundations are built.
            Fixing gaps at age 7 is dramatically easier than at age 14. Early intervention
            has the highest leverage.
          </p>
        </div>
      </div>
    </section>

    <div class="flex justify-between items-center py-8 border-t border-gray-200">
      <RouterLink to="/docs/ai-tutoring" class="text-blue-600 hover:text-blue-800">&larr; AI Tutoring Done Right</RouterLink>
      <RouterLink to="/docs" class="text-blue-600 hover:text-blue-800">All articles &rarr;</RouterLink>
    </div>
  </div>
</template>
