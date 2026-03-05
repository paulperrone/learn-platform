<script setup lang="ts">
import { RouterLink } from "vue-router";
import { onMounted } from "vue";

onMounted(() => {
  document.title = "AI Tutoring Done Right — Learn Platform";

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

  setMeta("description", "How our AI tutor uses the Socratic method, progressive hints, and worked examples to guide thinking — not give answers. With parent-controlled budget caps.");
  setMeta("og:title", "AI Tutoring Done Right — Learn Platform", true);
  setMeta("og:description", "Socratic method, progressive hints, and why our AI guides thinking instead of giving answers.", true);
  setMeta("og:type", "article", true);
});
</script>

<template>
  <div class="max-w-3xl mx-auto">
    <div class="mb-4">
      <RouterLink to="/docs" class="text-sm text-blue-600 hover:text-blue-800">&larr; All articles</RouterLink>
    </div>

    <h1 class="text-4xl font-bold text-gray-900 mb-4">AI Tutoring Done Right</h1>
    <p class="text-lg text-gray-500 mb-10">Socratic method, hint progression, and budget controls.</p>

    <!-- The Dialogue Trap -->
    <section class="mb-12">
      <h2 class="text-2xl font-bold text-gray-900 mb-4">The "dialogue-alone" trap</h2>
      <p class="text-gray-700 leading-relaxed mb-4">
        Many AI tutoring systems treat conversation as the goal. A student asks a question,
        the AI explains, the student nods along. This feels productive but research shows
        a critical problem: <strong>rich dialogue doesn't always improve test outcomes</strong>.
      </p>
      <p class="text-gray-700 leading-relaxed mb-4">
        Khanmigo, Khan Academy's AI tutor, found that their biggest challenge was achieving
        meaningful student engagement. Many interactions showed minimal cognitive effort — students
        sought quick answers rather than working through problems. This is the "dialogue-alone
        trap": conversation without structured scaffolding creates the illusion of learning
        without the substance.
      </p>
      <p class="text-gray-700 leading-relaxed">
        Our AI tutor avoids this trap by combining Socratic questioning with the structured
        learning loop. The AI is a tool <em>within</em> the mastery learning system, not a
        replacement for it.
      </p>
    </section>

    <!-- Socratic Method -->
    <section class="mb-12">
      <h2 class="text-2xl font-bold text-gray-900 mb-4">The Socratic method</h2>
      <p class="text-gray-700 leading-relaxed mb-4">
        Research shows that Socratic AI tutors support development of reflection and critical
        thinking significantly better than standard chatbots. Students progress from vague
        help-seeking to sophisticated problem decomposition within 2–3 weeks, with over 75%
        producing substantive reflections.
      </p>
      <p class="text-gray-700 leading-relaxed mb-4">
        The key principle: <strong>never give the answer on the first interaction</strong>.
        Instead, ask guiding questions that lead the student to discover the answer themselves.
        This creates deeper, more durable understanding than simply being told what to do.
      </p>

      <div class="bg-gray-50 border border-gray-200 rounded-lg p-6 mb-4">
        <p class="text-sm text-gray-500 mb-4 font-medium">Example interaction: 15 + 8 = ?</p>
        <div class="space-y-4 text-sm">
          <div class="flex gap-3">
            <span class="text-gray-400 shrink-0 w-16 text-right">Student:</span>
            <p class="text-gray-700">"I don't know how to do this."</p>
          </div>
          <div class="flex gap-3">
            <span class="text-blue-500 shrink-0 w-16 text-right font-medium">Tutor:</span>
            <p class="text-gray-700">"What do you already know about adding? Can you break 8 into parts that are easier to work with?"</p>
          </div>
          <div class="flex gap-3">
            <span class="text-gray-400 shrink-0 w-16 text-right">Student:</span>
            <p class="text-gray-700">"I could do 5 and 3?"</p>
          </div>
          <div class="flex gap-3">
            <span class="text-blue-500 shrink-0 w-16 text-right font-medium">Tutor:</span>
            <p class="text-gray-700">"Great idea! So what's 15 + 5?"</p>
          </div>
          <div class="flex gap-3">
            <span class="text-gray-400 shrink-0 w-16 text-right">Student:</span>
            <p class="text-gray-700">"20! And then 20 + 3 = 23!"</p>
          </div>
          <div class="flex gap-3">
            <span class="text-blue-500 shrink-0 w-16 text-right font-medium">Tutor:</span>
            <p class="text-gray-700">"Exactly right. You just used the 'make a ten' strategy. Can you explain why breaking 8 into 5 + 3 made this easier?"</p>
          </div>
        </div>
      </div>

      <p class="text-gray-700 leading-relaxed">
        Notice the final question — it's a <strong>self-explanation prompt</strong>. Research
        shows that students who articulate <em>why</em> a strategy works (not just <em>that</em>
        it works) develop significantly deeper understanding (Chi et al., 1989, 1994).
      </p>
    </section>

    <!-- Progressive Hints -->
    <section class="mb-12">
      <h2 class="text-2xl font-bold text-gray-900 mb-4">Progressive hint system</h2>
      <p class="text-gray-700 leading-relaxed mb-4">
        Research shows that too many, too few, or poorly calibrated hints all hurt learning.
        Our system uses a <strong>progressive escalation</strong> that matches hint intensity
        to the student's demonstrated need:
      </p>

      <div class="space-y-4 mb-6">
        <div class="flex items-start gap-4">
          <span class="bg-green-100 text-green-700 font-bold rounded-full w-8 h-8 flex items-center justify-center shrink-0 text-sm">1</span>
          <div>
            <h3 class="font-semibold text-gray-900">Guiding question</h3>
            <p class="text-gray-600 text-sm leading-relaxed">
              An open-ended question that points the student in the right direction without
              revealing the answer. "What operation might help here?" or "What do you already
              know about this type of problem?"
            </p>
          </div>
        </div>
        <div class="flex items-start gap-4">
          <span class="bg-yellow-100 text-yellow-700 font-bold rounded-full w-8 h-8 flex items-center justify-center shrink-0 text-sm">2</span>
          <div>
            <h3 class="font-semibold text-gray-900">Narrowing hint</h3>
            <p class="text-gray-600 text-sm leading-relaxed">
              A more specific nudge that identifies the strategy or approach. "Try breaking
              this into smaller parts" or "Think about place value — what does the 2 in 25
              actually mean?"
            </p>
          </div>
        </div>
        <div class="flex items-start gap-4">
          <span class="bg-amber-100 text-amber-700 font-bold rounded-full w-8 h-8 flex items-center justify-center shrink-0 text-sm">3</span>
          <div>
            <h3 class="font-semibold text-gray-900">Partial worked example</h3>
            <p class="text-gray-600 text-sm leading-relaxed">
              Show part of the solution process, leaving the final steps for the student.
              This uses backward fading — the most effective scaffolding technique for worked
              examples (Renkl & Atkinson, 2004).
            </p>
          </div>
        </div>
        <div class="flex items-start gap-4">
          <span class="bg-red-100 text-red-700 font-bold rounded-full w-8 h-8 flex items-center justify-center shrink-0 text-sm">4</span>
          <div>
            <h3 class="font-semibold text-gray-900">Full explanation</h3>
            <p class="text-gray-600 text-sm leading-relaxed">
              Complete step-by-step walkthrough, but only after genuine effort. If the student
              reaches this level repeatedly, the system flags the topic's prerequisites for
              remediation — struggling at the hint level often means a foundational gap.
            </p>
          </div>
        </div>
      </div>

      <div class="bg-amber-50 border border-amber-200 rounded-lg p-5 mb-4">
        <p class="text-sm font-semibold text-amber-800 mb-2">K-5 adaptation</p>
        <p class="text-sm text-amber-900 leading-relaxed">
          For younger learners, interactions are kept short and concrete. Maximum 2–3 exchanges
          before escalating to a worked example. The system monitors for "minimal effort"
          patterns — short response times, single-word answers — and adjusts accordingly.
        </p>
      </div>
    </section>

    <!-- Prerequisite-Aware Tutoring -->
    <section class="mb-12">
      <h2 class="text-2xl font-bold text-gray-900 mb-4">Prerequisite-aware tutoring</h2>
      <p class="text-gray-700 leading-relaxed mb-4">
        Our AI tutor doesn't operate in isolation. It has access to the student's full
        <RouterLink to="/docs/knowledge-graph" class="text-blue-600 underline">knowledge graph</RouterLink>
        state — which topics they've mastered, which prerequisites are weak, their FSRS
        history. This context makes hints dramatically more effective.
      </p>
      <p class="text-gray-700 leading-relaxed mb-4">
        If a student is struggling with two-digit addition and their "place value"
        prerequisite shows low stability in FSRS, the AI recognizes this and can say:
        "Let's make sure you're solid on place value first. What does the 3 in 37 represent?"
        rather than re-explaining addition procedures that aren't the actual problem.
      </p>
      <p class="text-gray-700 leading-relaxed">
        When prerequisites are clearly weak, the system flags the topic for
        <strong>remediation</strong> rather than trying to teach through hints — an
        important distinction. No amount of hinting helps if the foundational skill
        isn't there.
      </p>
    </section>

    <!-- Budget Controls -->
    <section class="mb-12">
      <h2 class="text-2xl font-bold text-gray-900 mb-4">Parent-controlled budget caps</h2>
      <p class="text-gray-700 leading-relaxed mb-4">
        AI tutoring costs money — each interaction uses a language model. We believe parents
        should have full transparency and control over this spending:
      </p>
      <div class="space-y-3 mb-4">
        <div class="bg-white border border-gray-200 rounded-lg p-4">
          <p class="text-gray-700 text-sm leading-relaxed">
            <strong>Monthly budget caps.</strong> Parents set a maximum monthly spend per
            child. When the budget is reached, AI features are paused but all non-AI learning
            continues uninterrupted.
          </p>
        </div>
        <div class="bg-white border border-gray-200 rounded-lg p-4">
          <p class="text-gray-700 text-sm leading-relaxed">
            <strong>Usage dashboard.</strong> Parents see exactly how much AI time each
            child is using, what topics triggered tutoring, and the cost breakdown.
          </p>
        </div>
        <div class="bg-white border border-gray-200 rounded-lg p-4">
          <p class="text-gray-700 text-sm leading-relaxed">
            <strong>Model-agnostic.</strong> We use OpenRouter to route to the best-value
            model for each interaction. Costs scale with actual usage, not flat subscription
            fees that subsidize heavy users.
          </p>
        </div>
      </div>
      <p class="text-gray-700 leading-relaxed">
        The core platform — knowledge graph, spaced repetition, problems, worked examples,
        progress tracking — is completely free. AI features are the only paid component.
      </p>
    </section>

    <!-- References -->
    <section class="mb-12">
      <h2 class="text-2xl font-bold text-gray-900 mb-4">References</h2>
      <div class="bg-gray-50 border border-gray-200 rounded-lg p-6">
        <ul class="space-y-2 text-sm text-gray-700">
          <li>Chi, M.T.H. et al. (1989). "Self-explanations: How students study and use examples in learning to solve problems." <em>Cognitive Science</em>, 13(2), 145–182.</li>
          <li>Chi, M.T.H. et al. (1994). "Eliciting self-explanations improves understanding." <em>Cognitive Science</em>, 18(3), 439–477.</li>
          <li>Renkl, A. & Atkinson, R.K. (2004). "Fading worked-out examples." <em>Instructional Science</em>.</li>
          <li>Sweller, J. (2006). "The worked example effect and human cognition." <em>Learning and Instruction</em>.</li>
          <li>Halpern, D.F. & Hakel, M.D. (2003). "Applying the science of learning to the university and beyond." <em>Change</em>, 35(4), 36–41.</li>
          <li>Skycak, J. (2026). <em>The Math Academy Way</em>.</li>
        </ul>
      </div>
    </section>

    <div class="flex justify-between items-center py-8 border-t border-gray-200">
      <RouterLink to="/docs/knowledge-graph" class="text-blue-600 hover:text-blue-800">&larr; The Knowledge Graph Approach</RouterLink>
      <RouterLink to="/docs/comparison" class="text-blue-600 hover:text-blue-800">Our Approach vs. Others &rarr;</RouterLink>
    </div>
  </div>
</template>
