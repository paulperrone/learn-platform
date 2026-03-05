<script setup lang="ts">
import { RouterLink } from "vue-router";
import { onMounted } from "vue";

onMounted(() => {
  document.title = "Why Mastery Learning Works — Learn Platform";

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

  setMeta("description", "How mastery learning produces 2x better outcomes than traditional classrooms, and how our platform implements Bloom's Two-Sigma insight at scale.");
  setMeta("og:title", "Why Mastery Learning Works — Learn Platform", true);
  setMeta("og:description", "Bloom's Two-Sigma Problem, mastery thresholds, and individualized pacing backed by decades of research.", true);
  setMeta("og:type", "article", true);
});
</script>

<template>
  <div class="max-w-3xl mx-auto">
    <div class="mb-4">
      <RouterLink to="/docs" class="text-sm text-blue-600 hover:text-blue-800">&larr; All articles</RouterLink>
    </div>

    <h1 class="text-4xl font-bold text-gray-900 mb-4">Why Mastery Learning Works</h1>
    <p class="text-lg text-gray-500 mb-10">Bloom's Two-Sigma Problem and how technology finally solves it.</p>

    <!-- The Two-Sigma Problem -->
    <section class="mb-12">
      <h2 class="text-2xl font-bold text-gray-900 mb-4">The Two-Sigma Problem</h2>
      <p class="text-gray-700 leading-relaxed mb-4">
        In 1984, educational psychologist Benjamin Bloom published one of the most important
        findings in the history of education. Students who received one-on-one tutoring with
        mastery learning performed <strong>two standard deviations</strong> better than students
        in conventional classrooms. The average tutored student outperformed 98% of traditionally
        taught students.
      </p>
      <p class="text-gray-700 leading-relaxed mb-4">
        Bloom called this the "Two-Sigma Problem" — not because the result was a problem, but
        because the challenge of delivering this quality of instruction to every student, at
        an affordable cost, seemed intractable. One-on-one human tutoring simply doesn't scale.
      </p>
      <p class="text-gray-700 leading-relaxed mb-4">
        More conservative follow-up research found effect sizes of d = 0.52–0.94 for classroom
        mastery learning without individual tutoring, and d = 0.37 for tutoring programs generally
        (Guskey & Pigott, 1988; 2020 meta-analysis of 96 RCTs). Even at the conservative end,
        mastery learning is one of the most effective educational interventions ever measured.
      </p>

      <div class="bg-gray-50 border border-gray-200 rounded-lg p-6 mb-4">
        <p class="text-sm text-gray-500 mb-3 font-medium">Effect sizes by approach</p>
        <div class="space-y-3">
          <div class="flex items-center gap-3">
            <div class="w-32 text-sm text-gray-600 shrink-0">Traditional classroom</div>
            <div class="bg-gray-300 rounded h-5" style="width: 40px"></div>
            <span class="text-xs text-gray-500">baseline</span>
          </div>
          <div class="flex items-center gap-3">
            <div class="w-32 text-sm text-gray-600 shrink-0">Classroom mastery</div>
            <div class="bg-blue-400 rounded h-5" style="width: 120px"></div>
            <span class="text-xs text-gray-500">+0.5–1.0 SD</span>
          </div>
          <div class="flex items-center gap-3">
            <div class="w-32 text-sm text-gray-600 shrink-0">1-on-1 tutoring</div>
            <div class="bg-blue-600 rounded h-5" style="width: 240px"></div>
            <span class="text-xs text-gray-500">+2.0 SD (98th percentile)</span>
          </div>
        </div>
      </div>

      <cite class="block text-sm text-gray-500 mt-3">
        Bloom, B.S. (1984). "The 2 Sigma Problem: The Search for Methods of Group Instruction as Effective as One-to-One Tutoring." Educational Researcher, 13(6), 4–16.
      </cite>
    </section>

    <!-- What Is Mastery Learning -->
    <section class="mb-12">
      <h2 class="text-2xl font-bold text-gray-900 mb-4">What mastery learning actually means</h2>
      <p class="text-gray-700 leading-relaxed mb-4">
        In traditional education, every student moves at the same pace. Time is fixed and
        achievement varies — some students master the material, many don't. Mastery learning
        inverts this: <strong>achievement is fixed and time varies</strong>. Every student
        must demonstrate genuine understanding before advancing, but each student is given
        whatever time they need to get there.
      </p>
      <p class="text-gray-700 leading-relaxed mb-4">
        This isn't about going slow. Students with strong foundations frequently
        <em>accelerate</em> because they don't need to relearn half-understood prerequisites.
        The initial investment in solid foundations pays compound interest throughout their
        learning journey.
      </p>

      <div class="bg-amber-50 border border-amber-200 rounded-lg p-5 mb-4">
        <p class="text-sm font-semibold text-amber-800 mb-2">The critical insight</p>
        <p class="text-sm text-amber-900 leading-relaxed">
          Mastery learning was deliberately suppressed by educational establishments despite
          documented effectiveness (Sherman, 1992; Buskist, Cush, & DeGrandpre, 1991). The
          Personalized System of Instruction (PSI), Keller's implementation of mastery learning,
          consistently outperformed traditional instruction but required restructuring how
          courses were organized — an institutional change few were willing to make.
        </p>
      </div>

      <cite class="block text-sm text-gray-500 mt-3">
        Kulik, C.C., Kulik, J.A., & Bangert-Drowns, R.L. (1990). "Effectiveness of Mastery Learning Programs." Review of Educational Research, 60(2), 265–299.
      </cite>
    </section>

    <!-- Our Implementation -->
    <section class="mb-12">
      <h2 class="text-2xl font-bold text-gray-900 mb-4">How we implement mastery learning</h2>
      <p class="text-gray-700 leading-relaxed mb-4">
        Our platform combines three technologies that together approximate what Bloom's
        expert tutors did intuitively:
      </p>

      <div class="space-y-4 mb-6">
        <div class="bg-white border border-gray-200 rounded-lg p-5">
          <h3 class="font-semibold text-gray-900 mb-2">Knowledge graph for sequencing</h3>
          <p class="text-gray-600 text-sm leading-relaxed">
            A directed acyclic graph of 71 topics with prerequisite edges ensures students
            always have the right foundations. The system decides what to teach next —
            <RouterLink to="/docs/knowledge-graph" class="text-blue-600 underline">read more</RouterLink>.
          </p>
        </div>
        <div class="bg-white border border-gray-200 rounded-lg p-5">
          <h3 class="font-semibold text-gray-900 mb-2">FSRS for review scheduling</h3>
          <p class="text-gray-600 text-sm leading-relaxed">
            The FSRS algorithm schedules reviews at optimal intervals, personalizing to each
            student's learning speed. Combined with FIRe credit, this ensures long-term retention —
            <RouterLink to="/docs/spaced-repetition" class="text-blue-600 underline">read more</RouterLink>.
          </p>
        </div>
        <div class="bg-white border border-gray-200 rounded-lg p-5">
          <h3 class="font-semibold text-gray-900 mb-2">AI tutoring for help when stuck</h3>
          <p class="text-gray-600 text-sm leading-relaxed">
            When a student struggles, the AI tutor uses Socratic questioning — guiding
            them to the answer rather than giving it away —
            <RouterLink to="/docs/ai-tutoring" class="text-blue-600 underline">read more</RouterLink>.
          </p>
        </div>
      </div>
    </section>

    <!-- The Learning Loop -->
    <section class="mb-12">
      <h2 class="text-2xl font-bold text-gray-900 mb-4">The learning loop</h2>
      <p class="text-gray-700 leading-relaxed mb-4">
        Each topic follows a structured six-phase learning loop, grounded in research on
        how people actually learn:
      </p>

      <div class="space-y-4 mb-6">
        <div class="flex items-start gap-4">
          <span class="bg-blue-100 text-blue-700 font-bold rounded-full w-8 h-8 flex items-center justify-center shrink-0 text-sm">1</span>
          <div>
            <h3 class="font-semibold text-gray-900">Pretest</h3>
            <p class="text-gray-600 text-sm leading-relaxed">
              2–3 diagnostic questions assess what the student already knows. Students who
              demonstrate existing mastery skip ahead. Even failed pretesting primes the brain
              for subsequent instruction through a "search-set" mechanism (Sinha & Kapur, 2021).
            </p>
          </div>
        </div>
        <div class="flex items-start gap-4">
          <span class="bg-blue-100 text-blue-700 font-bold rounded-full w-8 h-8 flex items-center justify-center shrink-0 text-sm">2</span>
          <div>
            <h3 class="font-semibold text-gray-900">Instruction</h3>
            <p class="text-gray-600 text-sm leading-relaxed">
              Step-by-step worked examples show how to approach each problem type. Subgoal labels
              help students see the structure (Catrambone, 1995). Each worked example is followed
              by practice problems, at a ratio of roughly 7 practice problems per 1 worked example.
            </p>
          </div>
        </div>
        <div class="flex items-start gap-4">
          <span class="bg-blue-100 text-blue-700 font-bold rounded-full w-8 h-8 flex items-center justify-center shrink-0 text-sm">3</span>
          <div>
            <h3 class="font-semibold text-gray-900">Guided practice</h3>
            <p class="text-gray-600 text-sm leading-relaxed">
              Students solve problems with hints and scaffolding available. Backward fading
              gradually removes support — first the last step is blanked, then the last two,
              until the student solves independently (Renkl & Atkinson, 2004).
            </p>
          </div>
        </div>
        <div class="flex items-start gap-4">
          <span class="bg-blue-100 text-blue-700 font-bold rounded-full w-8 h-8 flex items-center justify-center shrink-0 text-sm">4</span>
          <div>
            <h3 class="font-semibold text-gray-900">Independent practice</h3>
            <p class="text-gray-600 text-sm leading-relaxed">
              No scaffolding. The student must demonstrate they can solve problems unassisted.
              Confidence ratings after each problem build metacognitive awareness.
            </p>
          </div>
        </div>
        <div class="flex items-start gap-4">
          <span class="bg-blue-100 text-blue-700 font-bold rounded-full w-8 h-8 flex items-center justify-center shrink-0 text-sm">5</span>
          <div>
            <h3 class="font-semibold text-gray-900">Spaced review</h3>
            <p class="text-gray-600 text-sm leading-relaxed">
              FSRS schedules reviews at optimal intervals. Each review is interleaved with
              problems from other topics. Reviews are compressed via FIRe credit — practicing
              advanced topics implicitly reviews foundational ones.
            </p>
          </div>
        </div>
        <div class="flex items-start gap-4">
          <span class="bg-blue-100 text-blue-700 font-bold rounded-full w-8 h-8 flex items-center justify-center shrink-0 text-sm">6</span>
          <div>
            <h3 class="font-semibold text-gray-900">Remediation</h3>
            <p class="text-gray-600 text-sm leading-relaxed">
              If a student struggles, the system traces prerequisites to find the specific
              foundational gap. They strengthen that prerequisite, then return. Being stuck on
              one topic doesn't block progress on unrelated topics.
            </p>
          </div>
        </div>
      </div>

      <cite class="block text-sm text-gray-500">
        Math Academy achieves 95% first-attempt pass rate, 99% within two attempts — evidence
        that well-implemented mastery learning with refined content can approach Bloom's ideal.
      </cite>
    </section>

    <!-- Active Learning -->
    <section class="mb-12">
      <h2 class="text-2xl font-bold text-gray-900 mb-4">Why active learning, not videos</h2>
      <p class="text-gray-700 leading-relaxed mb-4">
        A meta-analysis of hundreds of STEM courses found that active learning — solving
        problems, not watching — significantly improves outcomes. The authors went so far as
        to recommend "abandoning traditional lecturing" (Freeman et al., 2014).
      </p>
      <p class="text-gray-700 leading-relaxed mb-4">
        Harvard physics researchers found something even more striking: students in active
        learning classrooms <em>felt</em> they learned less but actually learned <em>more</em>
        on objective measures (Deslauriers et al., 2019). Passive learning creates an "illusion
        of competence" — you feel like you understand because the material flows smoothly, but
        you haven't actually built retrievable knowledge.
      </p>
      <p class="text-gray-700 leading-relaxed mb-4">
        Meta-analyses of retrieval practice (the testing effect) show effect sizes of g = 0.50–0.61
        (Rowland, 2014; Adesope et al., 2017). Short-answer tests (g = 0.70) outperform
        multiple-choice (g = 0.48) because they force deeper retrieval. This is why our platform
        uses constructed-response formats as the primary assessment type.
      </p>
      <cite class="block text-sm text-gray-500">
        Freeman, S. et al. (2014). "Active learning increases student performance in STEM." PNAS. |
        Deslauriers, L. et al. (2019). "Measuring actual learning versus feeling of learning." PNAS.
      </cite>
    </section>

    <!-- References -->
    <section class="mb-12">
      <h2 class="text-2xl font-bold text-gray-900 mb-4">References</h2>
      <div class="bg-gray-50 border border-gray-200 rounded-lg p-6">
        <ul class="space-y-2 text-sm text-gray-700">
          <li>Bloom, B.S. (1984). "The 2 Sigma Problem." <em>Educational Researcher</em>, 13(6), 4–16.</li>
          <li>Kulik, C.C., Kulik, J.A., & Bangert-Drowns, R.L. (1990). "Effectiveness of Mastery Learning Programs." <em>Review of Educational Research</em>, 60(2), 265–299.</li>
          <li>Guskey, T.R., & Pigott, T.D. (1988). "Research on group-based mastery learning programs." <em>Journal of Educational Research</em>, 81(4), 197–216.</li>
          <li>Sherman, J.G. (1992). "Reflections on PSI." <em>Journal of Applied Behavior Analysis</em>, 25(1), 59–64.</li>
          <li>Freeman, S. et al. (2014). "Active learning increases student performance in science, engineering, and mathematics." <em>PNAS</em>, 111(23), 8410–8415.</li>
          <li>Deslauriers, L. et al. (2019). "Measuring actual learning versus feeling of learning." <em>PNAS</em>, 116(39), 19251–19257.</li>
          <li>Rowland, C.A. (2014). "The effect of testing versus restudy on retention." <em>Psychological Bulletin</em>, 140(6), 1432–1463.</li>
          <li>Adesope, O.O. et al. (2017). "Rethinking the Use of Tests." <em>Review of Educational Research</em>, 87(3), 659–701.</li>
          <li>Sinha, T., & Kapur, M. (2021). "When Problem Solving Followed by Instruction Works." <em>Review of Educational Research</em>, 91(4), 505–555.</li>
          <li>Renkl, A., & Atkinson, R.K. (2004). "Fading worked-out examples." <em>Instructional Science</em>.</li>
          <li>Catrambone, R. (1995). "Subgoal learning model." <em>Journal of Experimental Psychology: General</em>.</li>
          <li>Skycak, J. (2026). <em>The Math Academy Way</em>.</li>
        </ul>
      </div>
    </section>

    <div class="flex justify-between items-center py-8 border-t border-gray-200">
      <RouterLink to="/docs" class="text-blue-600 hover:text-blue-800">&larr; All articles</RouterLink>
      <RouterLink to="/docs/spaced-repetition" class="text-blue-600 hover:text-blue-800">How Spaced Repetition Optimizes Memory &rarr;</RouterLink>
    </div>
  </div>
</template>
