<script setup lang="ts">
import { RouterLink } from "vue-router";
import { onMounted } from "vue";

onMounted(() => {
  document.title = "How Spaced Repetition Optimizes Memory — Learn Platform";

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

  setMeta("description", "How the FSRS algorithm and FIRe credit system schedule reviews at optimal intervals to build permanent memory, not just test-day recall.");
  setMeta("og:title", "How Spaced Repetition Optimizes Memory — Learn Platform", true);
  setMeta("og:description", "FSRS algorithm, forgetting curves, and FIRe credit — the science of remembering forever.", true);
  setMeta("og:type", "article", true);
});
</script>

<template>
  <div class="max-w-3xl mx-auto">
    <div class="mb-4">
      <RouterLink to="/docs" class="text-sm text-blue-600 hover:text-blue-800">&larr; All articles</RouterLink>
    </div>

    <h1 class="text-4xl font-bold text-gray-900 mb-4">How Spaced Repetition Optimizes Memory</h1>
    <p class="text-lg text-gray-500 mb-10">The FSRS algorithm, forgetting curves, and FIRe credit.</p>

    <!-- The Forgetting Curve -->
    <section class="mb-12">
      <h2 class="text-2xl font-bold text-gray-900 mb-4">The forgetting curve</h2>
      <p class="text-gray-700 leading-relaxed mb-4">
        In 1885, Hermann Ebbinghaus conducted the first rigorous experiments on memory.
        He discovered that newly learned information decays rapidly at first — about 50%
        is lost within the first hour — then more slowly over days and weeks. This is the
        <strong>forgetting curve</strong>.
      </p>
      <p class="text-gray-700 leading-relaxed mb-4">
        But Ebbinghaus also discovered something more important: each time you successfully
        recall information, the forgetting curve <em>flattens</em>. The memory becomes more
        durable. If you review at just the right moment — right as the memory is about to
        fade — each review extends the interval dramatically.
      </p>

      <div class="bg-gray-50 border border-gray-200 rounded-lg p-6 mb-4">
        <p class="text-sm text-gray-500 mb-3 font-medium">How review intervals grow</p>
        <div class="flex items-end gap-3 h-28 justify-center">
          <div class="flex flex-col items-center gap-1">
            <div class="text-xs text-gray-500 mb-1">Review 1</div>
            <div class="bg-blue-500 rounded w-10" style="height: 20px"></div>
            <span class="text-xs text-gray-500">1 day</span>
          </div>
          <div class="flex flex-col items-center gap-1">
            <div class="text-xs text-gray-500 mb-1">Review 2</div>
            <div class="bg-blue-500 rounded w-10" style="height: 32px"></div>
            <span class="text-xs text-gray-500">3 days</span>
          </div>
          <div class="flex flex-col items-center gap-1">
            <div class="text-xs text-gray-500 mb-1">Review 3</div>
            <div class="bg-blue-500 rounded w-10" style="height: 48px"></div>
            <span class="text-xs text-gray-500">10 days</span>
          </div>
          <div class="flex flex-col items-center gap-1">
            <div class="text-xs text-gray-500 mb-1">Review 4</div>
            <div class="bg-blue-500 rounded w-10" style="height: 68px"></div>
            <span class="text-xs text-gray-500">1 month</span>
          </div>
          <div class="flex flex-col items-center gap-1">
            <div class="text-xs text-gray-500 mb-1">Review 5</div>
            <div class="bg-blue-500 rounded w-10" style="height: 90px"></div>
            <span class="text-xs text-gray-500">3 months</span>
          </div>
          <div class="flex flex-col items-center gap-1">
            <div class="text-xs text-gray-500 mb-1">Review 6</div>
            <div class="bg-blue-500 rounded w-10" style="height: 108px"></div>
            <span class="text-xs text-gray-500">1 year</span>
          </div>
        </div>
        <p class="text-xs text-gray-500 mt-3">Each successful review extends the next interval. After 6-7 reviews, memories can last years.</p>
      </div>

      <p class="text-gray-700 leading-relaxed mb-4">
        This is not a new finding. Bahrick et al. (1993) showed that spaced repetition can
        maintain memories for <strong>5+ years</strong>. Rohrer (2009) called spacing "arguably
        the largest and most robust finding in learning research." The science has been
        settled for over a century — what's changed is that algorithms can now implement it
        optimally for each individual student.
      </p>
      <cite class="block text-sm text-gray-500">
        Ebbinghaus, H. (1885). <em>Uber das Gedachtnis</em>. | Bahrick, H.P. et al. (1993). "Maintenance of foreign language vocabulary and the spacing effect." <em>Psychological Science</em>.
      </cite>
    </section>

    <!-- The FSRS Algorithm -->
    <section class="mb-12">
      <h2 class="text-2xl font-bold text-gray-900 mb-4">The FSRS algorithm</h2>
      <p class="text-gray-700 leading-relaxed mb-4">
        Most spaced repetition systems use SM-2, an algorithm from 1987. We use
        <strong>FSRS</strong> (Free Spaced Repetition Scheduler), a modern open-source
        algorithm that has been shown to be <strong>99.6% superior to SM-2</strong> in
        head-to-head comparison. Users do 20–30% fewer reviews for the same retention level.
      </p>

      <p class="text-gray-700 leading-relaxed mb-4">
        FSRS models three properties of each memory:
      </p>

      <div class="space-y-3 mb-6">
        <div class="bg-white border border-gray-200 rounded-lg p-4">
          <h3 class="font-semibold text-gray-900 mb-1">Difficulty (D)</h3>
          <p class="text-gray-600 text-sm leading-relaxed">
            How inherently hard this material is for this student. Includes mean reversion
            to prevent "ease hell" — a chronic SM-2 problem where a few wrong answers
            permanently classify material as difficult.
          </p>
        </div>
        <div class="bg-white border border-gray-200 rounded-lg p-4">
          <h3 class="font-semibold text-gray-900 mb-1">Stability (S)</h3>
          <p class="text-gray-600 text-sm leading-relaxed">
            How long the memory will persist before dropping below the target retrievability.
            Stability grows with each successful review.
          </p>
        </div>
        <div class="bg-white border border-gray-200 rounded-lg p-4">
          <h3 class="font-semibold text-gray-900 mb-1">Retrievability (R)</h3>
          <p class="text-gray-600 text-sm leading-relaxed">
            The current probability that the student can recall this information right now.
            Decays over time following a power-law forgetting curve (more accurate than the
            exponential model most systems use).
          </p>
        </div>
      </div>

      <p class="text-gray-700 leading-relaxed mb-4">
        FSRS uses 21 parameters trained on hundreds of millions of reviews from ~10,000 users.
        These parameters can be further personalized to each student based on their own review
        history. You set a target retention rate (we use 90%) and FSRS computes the optimal
        review interval for every topic.
      </p>

      <div class="bg-amber-50 border border-amber-200 rounded-lg p-5 mb-4">
        <p class="text-sm font-semibold text-amber-800 mb-2">Why not SM-2 (Anki)?</p>
        <p class="text-sm text-amber-900 leading-relaxed">
          SM-2 was designed in 1987 and has known failure modes. Its "ease factor" can spiral
          downward permanently after a few wrong answers ("ease hell"). It uses a fixed formula
          that doesn't adapt to individual learning speed. FSRS addresses all of these issues
          with a modern machine-learning approach while remaining open source (MIT license).
        </p>
      </div>
    </section>

    <!-- FIRe Credit -->
    <section class="mb-12">
      <h2 class="text-2xl font-bold text-gray-900 mb-4">FIRe: Fractional Implicit Repetition</h2>
      <p class="text-gray-700 leading-relaxed mb-4">
        Standard spaced repetition treats every topic as independent. But math is hierarchical.
        When a student practices "Multiply within 100," they are implicitly exercising
        "Times tables," "Add within 20," and "Place value." Our system recognizes these
        <strong>encompassing relationships</strong> and gives fractional review credit
        automatically.
      </p>
      <p class="text-gray-700 leading-relaxed mb-4">
        We call this <strong>FIRe</strong> — Fractional Implicit Repetition. It was
        developed by Math Academy and is grounded in the finding that tasks exercising prior
        knowledge restore memory as effectively as direct repetition (Ausubel, Robbins, &
        Blake, 1957).
      </p>

      <div class="bg-gray-50 border border-gray-200 rounded-lg p-6 mb-4">
        <p class="text-sm text-gray-500 mb-4 font-medium">How FIRe works</p>
        <div class="space-y-4 text-sm">
          <div>
            <p class="font-medium text-gray-800 mb-2">Downward flow (credit)</p>
            <p class="text-gray-600">
              Successful work on an advanced topic sends fractional credit to all encompassed
              simpler topics. The credit amount depends on the encompassing weight (0–1) and
              travels multiple layers deep through the graph.
            </p>
          </div>
          <div>
            <p class="font-medium text-gray-800 mb-2">Upward flow (penalty)</p>
            <p class="text-gray-600">
              Failed work on a simpler topic sends penalties upward to more advanced topics
              that depend on it. If the foundation is shaky, the structure above needs attention.
            </p>
          </div>
          <div>
            <p class="font-medium text-gray-800 mb-2">Review compression</p>
            <p class="text-gray-600">
              When scheduling reviews, the system selects tasks whose encompassing relationships
              "knock out" the most other due reviews simultaneously. Math Academy found that
              most courses can be learned with roughly <strong>only one explicit review per
              topic on average</strong>.
            </p>
          </div>
        </div>
      </div>

      <cite class="block text-sm text-gray-500">
        Ausubel, D.P., Robbins, L.C., & Blake, E. (1957). "Retroactive inhibition and facilitation in the learning of school materials." <em>Journal of Educational Psychology</em>. | Skycak, J. (2026). <em>The Math Academy Way</em>, Ch. 7: FIRe.
      </cite>
    </section>

    <!-- Interleaving -->
    <section class="mb-12">
      <h2 class="text-2xl font-bold text-gray-900 mb-4">Interleaved review</h2>
      <p class="text-gray-700 leading-relaxed mb-4">
        All reviews are interleaved — mixing problems from different topics in each session.
        This feels harder than blocked practice (doing 20 addition problems in a row), but
        research shows it <strong>doubles test scores</strong> (Taylor & Rohrer, 2010) and
        provides "near immunity against forgetting" (Rohrer, Dedrick, & Stershic, 2015).
      </p>
      <p class="text-gray-700 leading-relaxed mb-4">
        Interleaving works because it forces students to identify <em>which</em> strategy
        to use, not just apply one they already know is correct. In real math, the hardest
        part is often recognizing what type of problem you're looking at.
      </p>
      <p class="text-gray-700 leading-relaxed mb-4">
        Students consistently rate blocked practice as more effective, even after their own
        test scores prove the opposite (Kornell & Bjork, 2008). This is a "desirable
        difficulty" — it feels harder in the moment but produces dramatically better
        long-term learning.
      </p>

      <cite class="block text-sm text-gray-500">
        Taylor, K. & Rohrer, D. (2010). "The effects of interleaved practice." <em>Applied Cognitive Psychology</em>. |
        Bjork, R.A. & Bjork, E.L. (2011). "Making things hard on yourself, but in a good way." <em>Psychology and the Real World</em>.
      </cite>
    </section>

    <!-- References -->
    <section class="mb-12">
      <h2 class="text-2xl font-bold text-gray-900 mb-4">References</h2>
      <div class="bg-gray-50 border border-gray-200 rounded-lg p-6">
        <ul class="space-y-2 text-sm text-gray-700">
          <li>Ebbinghaus, H. (1885). <em>Uber das Gedachtnis</em>.</li>
          <li>Bahrick, H.P. et al. (1993). "Maintenance of foreign language vocabulary and the spacing effect." <em>Psychological Science</em>, 4(5), 316–321.</li>
          <li>Rohrer, D. (2009). "The effects of spacing and mixing practice problems." <em>Journal of Research in Mathematics Education</em>.</li>
          <li>Emeny, W.G., Hartwig, M.K., & Rohrer, D. (2021). "Spaced mathematics practice improves test scores and reduces overconfidence." <em>Applied Cognitive Psychology</em>, 35(4), 1082–1089.</li>
          <li>Vlach, H.A., Sandhofer, C.M., & Bjork, R.A. (2014). "Equal spacing and expanding retrieval practice." <em>Quarterly Journal of Experimental Psychology</em>.</li>
          <li>Taylor, K. & Rohrer, D. (2010). "The effects of interleaved practice." <em>Applied Cognitive Psychology</em>, 24(6), 837–848.</li>
          <li>Rohrer, D., Dedrick, R.F., & Stershic, S. (2015). "Interleaved practice improves mathematics learning." <em>Journal of Educational Psychology</em>, 107(3), 900–908.</li>
          <li>Kornell, N. & Bjork, R.A. (2008). "Learning concepts and categories." <em>Psychological Science</em>, 19(6), 585–592.</li>
          <li>Bjork, R.A. & Bjork, E.L. (2011). "Making things hard on yourself, but in a good way." <em>Psychology and the Real World</em>.</li>
          <li>Ausubel, D.P., Robbins, L.C., & Blake, E. (1957). <em>Journal of Educational Psychology</em>.</li>
          <li>Skycak, J. (2026). <em>The Math Academy Way</em>.</li>
        </ul>
      </div>
    </section>

    <div class="flex justify-between items-center py-8 border-t border-gray-200">
      <RouterLink to="/docs/mastery-learning" class="text-blue-600 hover:text-blue-800">&larr; Why Mastery Learning Works</RouterLink>
      <RouterLink to="/docs/knowledge-graph" class="text-blue-600 hover:text-blue-800">The Knowledge Graph Approach &rarr;</RouterLink>
    </div>
  </div>
</template>
