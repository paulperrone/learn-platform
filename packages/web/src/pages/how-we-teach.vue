<script setup lang="ts">
import { onMounted } from "vue";

onMounted(() => {
  document.title = "How We Teach — Learn Platform";

  // Set meta tags for SEO
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

  setMeta("description", "Learn how our platform uses mastery learning, spaced repetition, knowledge graphs, and AI tutoring — backed by decades of learning science research — to help your child truly master math.");
  setMeta("og:title", "How We Teach — Learn Platform", true);
  setMeta("og:description", "Research-backed learning science: mastery learning, spaced repetition, knowledge graphs, worked examples, and AI tutoring.", true);
  setMeta("og:type", "website", true);

  // FAQ structured data for search engines
  const faqSchema = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: [
      {
        "@type": "Question",
        name: "Is this aligned to Common Core?",
        acceptedAnswer: {
          "@type": "Answer",
          text: "Yes. Our Math K-5 curriculum covers 71 topics aligned to Common Core standards, from counting through early algebra.",
        },
      },
      {
        "@type": "Question",
        name: "How does AI tutoring work?",
        acceptedAnswer: {
          "@type": "Answer",
          text: "When your child gets stuck, our AI tutor uses the Socratic method — asking guiding questions and giving progressive hints rather than just giving the answer. It encourages thinking, not dependence.",
        },
      },
      {
        "@type": "Question",
        name: "Is my child's data safe?",
        acceptedAnswer: {
          "@type": "Answer",
          text: "We collect only what's needed for learning (progress data, responses). No advertising, no selling data. Parents have full visibility and control through family accounts.",
        },
      },
      {
        "@type": "Question",
        name: "What is spaced repetition?",
        acceptedAnswer: {
          "@type": "Answer",
          text: "Spaced repetition is a scientifically proven technique that schedules reviews at optimal intervals to move knowledge into long-term memory. Our system uses the FSRS algorithm to personalize review timing for each student on each topic.",
        },
      },
    ],
  };
  let scriptEl = document.querySelector('script[type="application/ld+json"]') as HTMLScriptElement | null;
  if (!scriptEl) {
    scriptEl = document.createElement("script");
    scriptEl.type = "application/ld+json";
    document.head.appendChild(scriptEl);
  }
  scriptEl.textContent = JSON.stringify(faqSchema);
});
</script>

<template>
  <div class="max-w-4xl mx-auto">
    <!-- Hero -->
    <div class="mb-12">
      <h1 class="text-4xl font-bold text-gray-900 mb-4">How We Teach</h1>
      <p class="text-xl text-gray-600 leading-relaxed">
        Our platform is built on decades of learning science research — the same principles
        that produce 2x better outcomes than traditional classrooms. Here's how it works,
        explained for parents, not professors.
      </p>
    </div>

    <!-- Quick Summary -->
    <div class="bg-blue-50 border border-blue-200 rounded-xl p-6 mb-12">
      <h2 class="text-lg font-semibold text-blue-900 mb-3">The short version</h2>
      <p class="text-blue-800 leading-relaxed">
        Your child learns through a <strong>knowledge graph</strong> that ensures they always have the right
        foundations before tackling something new. They practice by <strong>solving problems</strong>, not
        watching videos. A <strong>spaced repetition</strong> system ensures they remember what they learn.
        When they get stuck, an <strong>AI tutor</strong> guides them with questions — not answers.
        Everything is personalized to their pace.
      </p>
    </div>

    <!-- Section: Bloom's Two-Sigma Problem -->
    <section class="mb-12">
      <h2 class="text-2xl font-bold text-gray-900 mb-4">Why this approach works</h2>
      <p class="text-gray-700 leading-relaxed mb-4">
        In 1984, educational psychologist Benjamin Bloom discovered something remarkable:
        students who received one-on-one tutoring performed <strong>two standard deviations</strong>
        better than those in traditional classrooms. The average tutored student outperformed
        98% of classroom-taught students.
      </p>
      <p class="text-gray-700 leading-relaxed mb-4">
        The problem? One-on-one tutoring is prohibitively expensive. Bloom called this the
        "Two-Sigma Problem" — the challenge of delivering tutoring-quality instruction at scale.
      </p>
      <p class="text-gray-700 leading-relaxed">
        Technology now makes this possible. Our platform uses algorithms and AI to make the same
        decisions an expert tutor would: what to teach next, when to review, how to help when
        your child is stuck, and when to move on. Every child gets an individually tailored
        learning experience.
      </p>
      <cite class="block text-sm text-gray-500 mt-3">Bloom, B.S. (1984). "The 2 Sigma Problem." Educational Researcher.</cite>
    </section>

    <!-- Section: Knowledge Graph -->
    <section class="mb-12">
      <h2 class="text-2xl font-bold text-gray-900 mb-4">The knowledge graph: learning in the right order</h2>
      <p class="text-gray-700 leading-relaxed mb-4">
        Math isn't a list of isolated facts — it's a web of connected ideas. You can't do
        multiplication without understanding addition. You can't do fractions without understanding
        division. Our <strong>knowledge graph</strong> maps these connections explicitly.
      </p>

      <!-- Visual: Simple prerequisite chain -->
      <div class="bg-gray-50 border border-gray-200 rounded-lg p-6 mb-4">
        <p class="text-sm text-gray-500 mb-4 font-medium">Example: prerequisite chain</p>
        <div class="flex items-center justify-center gap-3 flex-wrap text-sm">
          <span class="bg-white border border-gray-300 rounded-lg px-4 py-2 font-medium">Count to 10</span>
          <span class="text-gray-400">&rarr;</span>
          <span class="bg-white border border-gray-300 rounded-lg px-4 py-2 font-medium">Add within 10</span>
          <span class="text-gray-400">&rarr;</span>
          <span class="bg-white border border-gray-300 rounded-lg px-4 py-2 font-medium">Add within 20</span>
          <span class="text-gray-400">&rarr;</span>
          <span class="bg-white border border-gray-300 rounded-lg px-4 py-2 font-medium">Add within 100</span>
        </div>
      </div>

      <p class="text-gray-700 leading-relaxed mb-4">
        Your child only encounters a topic when all its prerequisites are mastered. No gaps,
        no guessing, no "we'll cover that later." Research shows students are
        <strong>3-4x more likely to master a topic</strong> when they're working at the right level —
        what researchers call the <em>knowledge frontier</em>.
      </p>
      <p class="text-gray-700 leading-relaxed">
        Our Math K-5 curriculum covers 71 topics from counting through early algebra, all aligned
        to Common Core standards, with over 100 prerequisite connections ensuring proper sequencing.
      </p>
      <cite class="block text-sm text-gray-500 mt-3">Zou et al. (2019). Students are 3-4x more likely to master frontier topics vs. topics beyond their frontier.</cite>
    </section>

    <!-- Section: Mastery Learning -->
    <section class="mb-12">
      <h2 class="text-2xl font-bold text-gray-900 mb-4">Mastery learning: no child left behind</h2>
      <p class="text-gray-700 leading-relaxed mb-4">
        In a traditional classroom, every student moves at the same pace regardless of understanding.
        Some students fall behind and never recover. <strong>Mastery learning</strong> is the opposite:
        students must demonstrate genuine understanding of each topic before advancing.
      </p>
      <p class="text-gray-700 leading-relaxed mb-4">
        This isn't about going slow. It's about building solid foundations so your child can go
        <em>faster</em> later. Students with strong foundations accelerate naturally because they
        don't need to relearn things they half-understood.
      </p>

      <div class="bg-gray-50 border border-gray-200 rounded-lg p-6 mb-4">
        <p class="text-sm text-gray-500 mb-3 font-medium">Our learning loop for each topic</p>
        <div class="grid grid-cols-2 md:grid-cols-3 gap-3 text-sm">
          <div class="flex items-start gap-2">
            <span class="bg-blue-100 text-blue-700 font-bold rounded-full w-6 h-6 flex items-center justify-center shrink-0 text-xs">1</span>
            <span class="text-gray-700"><strong>Pretest</strong> — See what they already know</span>
          </div>
          <div class="flex items-start gap-2">
            <span class="bg-blue-100 text-blue-700 font-bold rounded-full w-6 h-6 flex items-center justify-center shrink-0 text-xs">2</span>
            <span class="text-gray-700"><strong>Instruction</strong> — Worked examples</span>
          </div>
          <div class="flex items-start gap-2">
            <span class="bg-blue-100 text-blue-700 font-bold rounded-full w-6 h-6 flex items-center justify-center shrink-0 text-xs">3</span>
            <span class="text-gray-700"><strong>Guided</strong> — Practice with hints</span>
          </div>
          <div class="flex items-start gap-2">
            <span class="bg-blue-100 text-blue-700 font-bold rounded-full w-6 h-6 flex items-center justify-center shrink-0 text-xs">4</span>
            <span class="text-gray-700"><strong>Independent</strong> — Practice alone</span>
          </div>
          <div class="flex items-start gap-2">
            <span class="bg-blue-100 text-blue-700 font-bold rounded-full w-6 h-6 flex items-center justify-center shrink-0 text-xs">5</span>
            <span class="text-gray-700"><strong>Review</strong> — Spaced repetition</span>
          </div>
          <div class="flex items-start gap-2">
            <span class="bg-blue-100 text-blue-700 font-bold rounded-full w-6 h-6 flex items-center justify-center shrink-0 text-xs">6</span>
            <span class="text-gray-700"><strong>Remediation</strong> — Fix gaps</span>
          </div>
        </div>
      </div>

      <cite class="block text-sm text-gray-500 mt-3">Bloom (1984); Kulik, Kulik, & Bangert-Drowns (1990). Mastery learning effect size ~0.5-1.0 standard deviations.</cite>
    </section>

    <!-- Section: Active Learning & Worked Examples -->
    <section class="mb-12">
      <h2 class="text-2xl font-bold text-gray-900 mb-4">Learning by doing, not watching</h2>
      <p class="text-gray-700 leading-relaxed mb-4">
        A meta-analysis of hundreds of studies found that active learning — actually solving problems —
        significantly outperforms passive approaches like watching videos or reading textbooks. Harvard
        researchers even found that students in active classes <em>felt</em> like they learned less
        but actually learned <em>more</em>. Passive learning creates an illusion of understanding.
      </p>
      <p class="text-gray-700 leading-relaxed mb-4">
        Each topic starts with <strong>worked examples</strong> — step-by-step demonstrations that
        show your child how to approach a problem. Then they immediately start solving similar
        problems on their own. The ratio is roughly 7 practice problems for every worked example.
      </p>

      <div class="bg-amber-50 border border-amber-200 rounded-lg p-5 mb-4">
        <p class="text-sm font-semibold text-amber-800 mb-2">Why worked examples?</p>
        <p class="text-sm text-amber-900 leading-relaxed">
          When learning something new, your child's working memory is limited — research suggests
          we can only hold about 4 items at once. Worked examples reduce cognitive overload by
          showing the process before asking students to do it themselves. As they gain
          confidence, the scaffolding is gradually removed — a technique called <strong>fading</strong>.
        </p>
      </div>

      <cite class="block text-sm text-gray-500 mt-3">Freeman et al. (2014). Meta-analysis: active learning improves STEM performance. Sweller (2006). Worked-example effect and cognitive load theory.</cite>
    </section>

    <!-- Section: Spaced Repetition -->
    <section class="mb-12">
      <h2 class="text-2xl font-bold text-gray-900 mb-4">Spaced repetition: remember forever, not just for the test</h2>
      <p class="text-gray-700 leading-relaxed mb-4">
        Here's a problem every parent recognizes: your child aces a unit test, then can't do the
        same problems three months later. This is because traditional "cram and forget" study
        doesn't create lasting memories.
      </p>
      <p class="text-gray-700 leading-relaxed mb-4">
        <strong>Spaced repetition</strong> solves this by reviewing material at scientifically
        optimized intervals. Right when your child is about to forget something, the system
        schedules a review. Each successful review extends the interval — from days, to weeks,
        to months, to years.
      </p>

      <!-- Visual: Spacing intervals -->
      <div class="bg-gray-50 border border-gray-200 rounded-lg p-6 mb-4">
        <p class="text-sm text-gray-500 mb-3 font-medium">How review spacing grows over time</p>
        <div class="flex items-end gap-2 h-24">
          <div class="flex flex-col items-center gap-1">
            <div class="bg-blue-500 rounded w-8" style="height: 16px"></div>
            <span class="text-xs text-gray-500">1 day</span>
          </div>
          <div class="flex flex-col items-center gap-1">
            <div class="bg-blue-500 rounded w-8" style="height: 24px"></div>
            <span class="text-xs text-gray-500">3 days</span>
          </div>
          <div class="flex flex-col items-center gap-1">
            <div class="bg-blue-500 rounded w-8" style="height: 36px"></div>
            <span class="text-xs text-gray-500">1 week</span>
          </div>
          <div class="flex flex-col items-center gap-1">
            <div class="bg-blue-500 rounded w-8" style="height: 52px"></div>
            <span class="text-xs text-gray-500">2 weeks</span>
          </div>
          <div class="flex flex-col items-center gap-1">
            <div class="bg-blue-500 rounded w-8" style="height: 70px"></div>
            <span class="text-xs text-gray-500">1 month</span>
          </div>
          <div class="flex flex-col items-center gap-1">
            <div class="bg-blue-500 rounded w-8" style="height: 88px"></div>
            <span class="text-xs text-gray-500">3 months</span>
          </div>
        </div>
        <p class="text-xs text-gray-500 mt-3">Each successful review pushes the next review further out. The FSRS algorithm personalizes intervals to your child's learning speed.</p>
      </div>

      <p class="text-gray-700 leading-relaxed mb-4">
        We use <strong>FSRS</strong> (Free Spaced Repetition Scheduler), a modern algorithm that
        adapts to each student. If your child finds a topic easy, reviews are spaced further apart.
        If they struggle, reviews come more frequently. Every child's schedule is unique.
      </p>

      <cite class="block text-sm text-gray-500 mt-3">Ebbinghaus (1885). The forgetting curve. Bahrick et al. (1993). Spaced retention over 5+ years. Kang (2016). "Arguably the largest and most robust finding in learning research."</cite>
    </section>

    <!-- Section: FIRe Credit -->
    <section class="mb-12">
      <h2 class="text-2xl font-bold text-gray-900 mb-4">Smart review: practicing advanced skills reviews basic ones too</h2>
      <p class="text-gray-700 leading-relaxed mb-4">
        When your child practices "Add within 20," they're implicitly practicing "Add within 10"
        as well. Our system recognizes these <strong>encompassing relationships</strong> between topics
        and gives fractional review credit for the simpler skills automatically.
      </p>
      <p class="text-gray-700 leading-relaxed mb-4">
        We call this <strong>FIRe</strong> — Fractional Implicit Repetition. It dramatically reduces
        the number of standalone reviews your child needs, because advanced practice naturally
        reinforces foundational skills. Math is inherently hierarchical, and our review system
        takes full advantage of that structure.
      </p>

      <!-- Visual: FIRe credit -->
      <div class="bg-gray-50 border border-gray-200 rounded-lg p-6 mb-4">
        <p class="text-sm text-gray-500 mb-3 font-medium">How FIRe credit works</p>
        <div class="flex flex-col items-center gap-2 text-sm">
          <span class="bg-blue-100 border border-blue-300 rounded-lg px-4 py-2 font-medium text-blue-900">Practicing: Multiply within 100</span>
          <span class="text-gray-400 text-xs">gives implicit review credit to</span>
          <div class="flex gap-3">
            <span class="bg-green-50 border border-green-200 rounded-lg px-3 py-1.5 text-green-800">Times tables</span>
            <span class="bg-green-50 border border-green-200 rounded-lg px-3 py-1.5 text-green-800">Add within 20</span>
            <span class="bg-green-50 border border-green-200 rounded-lg px-3 py-1.5 text-green-800">Place value</span>
          </div>
        </div>
      </div>

      <cite class="block text-sm text-gray-500 mt-3">Ausubel, Robbins, & Blake (1957). Tasks exercising prior knowledge restore memory as effectively as direct repetition.</cite>
    </section>

    <!-- Section: Interleaving -->
    <section class="mb-12">
      <h2 class="text-2xl font-bold text-gray-900 mb-4">Mixed practice: the counterintuitive key to retention</h2>
      <p class="text-gray-700 leading-relaxed mb-4">
        Here's something surprising from the research: mixing up practice across different skills
        <strong>doubles</strong> test scores compared to practicing one skill at a time. When your
        child practices addition 20 times in a row, they know the next problem is addition — they
        don't have to figure out <em>which</em> skill to use. But real math requires identifying
        the right approach, not just applying it.
      </p>
      <p class="text-gray-700 leading-relaxed mb-4">
        Our review sessions are <strong>interleaved</strong> by design. Your child might see an
        addition problem, then a measurement problem, then a multiplication problem. This feels
        harder in the moment but produces dramatically better long-term learning. Researchers call
        this a "desirable difficulty."
      </p>
      <cite class="block text-sm text-gray-500 mt-3">Taylor & Rohrer (2010). Interleaving doubled test scores. Rohrer et al. (2015). Interleaved practice provided "near immunity against forgetting."</cite>
    </section>

    <!-- Section: AI Tutoring -->
    <section class="mb-12">
      <h2 class="text-2xl font-bold text-gray-900 mb-4">AI tutoring: help when they need it, not a crutch</h2>
      <p class="text-gray-700 leading-relaxed mb-4">
        When your child gets stuck, our AI tutor doesn't just give the answer. It uses the
        <strong>Socratic method</strong> — asking guiding questions to help your child work through
        the problem themselves. Research shows this approach builds deeper understanding than
        simply being told what to do.
      </p>

      <div class="bg-gray-50 border border-gray-200 rounded-lg p-6 mb-4">
        <p class="text-sm text-gray-500 mb-3 font-medium">Progressive hint system</p>
        <div class="space-y-3 text-sm">
          <div class="flex items-start gap-3">
            <span class="bg-green-100 text-green-700 font-bold rounded-full w-6 h-6 flex items-center justify-center shrink-0 text-xs">1</span>
            <div>
              <span class="font-medium text-gray-800">Gentle nudge</span>
              <p class="text-gray-600">"What do you already know about this problem? What operation might help?"</p>
            </div>
          </div>
          <div class="flex items-start gap-3">
            <span class="bg-yellow-100 text-yellow-700 font-bold rounded-full w-6 h-6 flex items-center justify-center shrink-0 text-xs">2</span>
            <div>
              <span class="font-medium text-gray-800">Specific guidance</span>
              <p class="text-gray-600">"Try breaking 15 + 8 into 15 + 5 + 3. Can you see why?"</p>
            </div>
          </div>
          <div class="flex items-start gap-3">
            <span class="bg-red-100 text-red-700 font-bold rounded-full w-6 h-6 flex items-center justify-center shrink-0 text-xs">3</span>
            <div>
              <span class="font-medium text-gray-800">Worked solution</span>
              <p class="text-gray-600">Full step-by-step walkthrough, only after genuine effort</p>
            </div>
          </div>
        </div>
      </div>

      <p class="text-gray-700 leading-relaxed">
        The AI also evaluates your child's self-explanations — when they explain their reasoning
        in their own words, we can identify misconceptions early and address them before they
        become habits.
      </p>
    </section>

    <!-- Section: Confidence Calibration -->
    <section class="mb-12">
      <h2 class="text-2xl font-bold text-gray-900 mb-4">Confidence calibration: knowing what you know</h2>
      <p class="text-gray-700 leading-relaxed mb-4">
        Before seeing the answer, your child rates how confident they feel about their response.
        Over time, this builds <strong>metacognitive awareness</strong> — the ability to accurately
        assess their own understanding. Students who can tell the difference between "I think I
        know this" and "I definitely know this" become much more effective learners.
      </p>
      <p class="text-gray-700 leading-relaxed">
        Research shows that massed practice (cramming) produces severe overconfidence, while
        spaced practice with confidence tracking produces accurate self-assessment. Our system
        tracks calibration accuracy and uses it to fine-tune review scheduling.
      </p>
      <cite class="block text-sm text-gray-500 mt-3">Emeny, Hartwig, & Rohrer (2021). Massed practice produces overconfidence; spaced practice yields accurate self-prediction.</cite>
    </section>

    <!-- Section: Remediation -->
    <section class="mb-12">
      <h2 class="text-2xl font-bold text-gray-900 mb-4">When they struggle: targeted remediation, not starting over</h2>
      <p class="text-gray-700 leading-relaxed mb-4">
        If your child struggles with a topic, the system doesn't just repeat the same problems.
        It traces the prerequisite graph to find the <strong>specific foundation</strong> that's
        causing the difficulty. Maybe they're struggling with two-digit addition not because they
        don't understand addition, but because they haven't fully mastered place value.
      </p>
      <p class="text-gray-700 leading-relaxed">
        The system sends them back to strengthen that specific prerequisite, then returns them
        to the original topic. Meanwhile, they can continue progressing on unrelated topics —
        being stuck on one thing doesn't block everything.
      </p>
    </section>

    <!-- FAQ Section -->
    <section class="mb-12">
      <h2 class="text-2xl font-bold text-gray-900 mb-6">Common questions</h2>
      <div class="space-y-4">
        <details class="bg-white border border-gray-200 rounded-lg">
          <summary class="px-5 py-4 cursor-pointer font-medium text-gray-800 hover:text-gray-900">Is this aligned to Common Core?</summary>
          <p class="px-5 pb-4 text-gray-600 leading-relaxed">Yes. Our Math K-5 curriculum covers 71 topics aligned to Common Core standards (K.CC, K.OA, 1.NBT, etc.), from counting through early algebra. Each topic includes its standard code so you can verify alignment.</p>
        </details>
        <details class="bg-white border border-gray-200 rounded-lg">
          <summary class="px-5 py-4 cursor-pointer font-medium text-gray-800 hover:text-gray-900">How does AI tutoring work?</summary>
          <p class="px-5 pb-4 text-gray-600 leading-relaxed">When your child gets stuck, they can ask for help. The AI tutor uses the Socratic method — asking guiding questions and giving progressive hints rather than just giving the answer. It encourages thinking, not dependence. AI features require a paid subscription ($5/month).</p>
        </details>
        <details class="bg-white border border-gray-200 rounded-lg">
          <summary class="px-5 py-4 cursor-pointer font-medium text-gray-800 hover:text-gray-900">Is my child's data safe?</summary>
          <p class="px-5 pb-4 text-gray-600 leading-relaxed">We collect only what's needed for learning — progress data and responses. No advertising, no selling data to third parties. Parents have full visibility and control through family accounts. All data is encrypted in transit and at rest.</p>
        </details>
        <details class="bg-white border border-gray-200 rounded-lg">
          <summary class="px-5 py-4 cursor-pointer font-medium text-gray-800 hover:text-gray-900">How is this different from Khan Academy or IXL?</summary>
          <p class="px-5 pb-4 text-gray-600 leading-relaxed">Most platforms organize content linearly (video, then quiz) without enforcing prerequisites or scheduling reviews. We use a knowledge graph to guarantee proper sequencing, spaced repetition to guarantee long-term retention, and AI tutoring for personalized help. The core platform is free; only AI features cost money.</p>
        </details>
        <details class="bg-white border border-gray-200 rounded-lg">
          <summary class="px-5 py-4 cursor-pointer font-medium text-gray-800 hover:text-gray-900">What does it cost?</summary>
          <p class="px-5 pb-4 text-gray-600 leading-relaxed">The full learning platform — knowledge graph, spaced repetition, problems, worked examples, progress tracking — is free. AI features (tutoring, grading, hints, speech-to-text) are $5/month or $50/year, with transparent usage-based pricing and parent-controlled spending caps.</p>
        </details>
      </div>
    </section>

    <!-- Research References -->
    <section class="mb-12">
      <h2 class="text-2xl font-bold text-gray-900 mb-4">Research foundations</h2>
      <p class="text-gray-700 leading-relaxed mb-4">
        Our approach is grounded in these key findings from learning science:
      </p>
      <div class="bg-gray-50 border border-gray-200 rounded-lg p-6">
        <ul class="space-y-3 text-sm text-gray-700">
          <li><strong>Bloom (1984)</strong> — The "Two-Sigma Problem": one-on-one tutoring produces 2 standard deviation improvement over traditional classrooms.</li>
          <li><strong>Ebbinghaus (1885)</strong> — Discovery of the forgetting curve and spacing effect, the foundation of spaced repetition.</li>
          <li><strong>Sweller (2006)</strong> — Cognitive load theory and the worked-example effect: reducing cognitive overload accelerates learning.</li>
          <li><strong>Freeman et al. (2014)</strong> — Meta-analysis: active learning significantly improves STEM outcomes vs. traditional lectures.</li>
          <li><strong>Taylor & Rohrer (2010)</strong> — Interleaved practice doubled test scores compared to blocked practice.</li>
          <li><strong>Bahrick et al. (1993)</strong> — Spaced repetition can maintain memories for 5+ years.</li>
          <li><strong>Zou et al. (2019)</strong> — Students are 3-4x more likely to master topics at their knowledge frontier.</li>
          <li><strong>Rowland (2014)</strong> — Meta-analysis: retrieval practice (testing) is one of the most effective learning strategies known.</li>
          <li><strong>Bjork & Bjork (2011)</strong> — "Desirable difficulties": strategies that feel harder in the moment produce better long-term learning.</li>
          <li><strong>Ausubel et al. (1957)</strong> — Tasks exercising prior knowledge restore memory as effectively as direct repetition (the basis for FIRe credit).</li>
        </ul>
      </div>
    </section>

    <!-- CTA -->
    <div class="text-center py-8 mb-8">
      <p class="text-lg text-gray-600 mb-6">Ready to see it in action?</p>
      <div class="flex justify-center gap-4">
        <RouterLink to="/signup" class="bg-blue-600 text-white px-8 py-3 rounded-lg text-lg font-semibold hover:bg-blue-700">Get started free</RouterLink>
        <RouterLink to="/explore" class="border border-gray-300 text-gray-700 px-8 py-3 rounded-lg text-lg font-semibold hover:bg-gray-50">Browse the curriculum</RouterLink>
      </div>
    </div>
  </div>
</template>
