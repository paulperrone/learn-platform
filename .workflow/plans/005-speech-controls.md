# Epic: Speech Controls (TTS/STT)

> **Created:** 2026-03-04T23:26:01Z
> **Completed:** —
>
> For project context, see [CLAUDE.md](../../CLAUDE.md)
> For product vision, see [SPEC.md](./SPEC.md)
> For decisions, see [DECISIONS.md](../../DECISIONS.md)

## Summary

Add text-to-speech for reading problems aloud (critical for K-2 learners who can't yet read fluently) and speech-to-text for verbal answers. Start with browser-native Web Speech APIs, evaluate external services (ElevenLabs, Deepgram) as quality upgrades. Speech features are opt-in and configurable per user/child.

## Progress

**Completed:** Phase 1, Phase 2, Phase 3
**In Progress:** —
**Next:** Phase 4

---

## Phase 1: Research & Browser API Spike ✓
**Goal:** Evaluate Web Speech API capabilities and limitations

1. [x] [RSH] Test Web Speech API SpeechSynthesis (TTS) across target browsers (Chrome, Safari, Firefox): voice quality for young learners, math notation pronunciation, language/voice options
2. [x] [RSH] Test Web Speech API SpeechRecognition (STT) across browsers: accuracy for children's voices, number recognition, handling of background noise, browser support gaps (Safari limitations)
3. [x] [RSH] Evaluate external service fallbacks: ElevenLabs (TTS quality/cost), Deepgram (STT accuracy/cost), Cloudflare Workers AI (any speech models available). Document trade-offs in RESEARCH.md.

**Validation:** ✓ RESEARCH.md entry with browser compatibility matrix, quality assessment, and recommended approach.
**Decision:** TTS = browser-native SpeechSynthesis (free, good support). STT = Cloudflare Workers AI Whisper large-v3-turbo (proven pattern from assistant project, $0.00051/min, all-browser support via MediaRecorder upload, AI binding in existing Worker).

---

## Phase 2: Text-to-Speech Integration ✓
**Goal:** Problems and worked examples can be read aloud

1. [x] [IMP] Create TTS composable (`useSpeech.ts`): wrap SpeechSynthesis API, handle voice selection, rate/pitch control, queue management for multi-sentence content
2. [x] [IMP] Add read-aloud button to ProblemView and WorkedExample components: speaker icon, play/pause/stop via reusable SpeakButton component
3. [x] [IMP] Handle math content in TTS: `mathToSpeech()` converter for operators (+ - × ÷ = > <), fractions, placeholders (? → "what")
4. [x] [TST] Typecheck passes across all packages. Manual browser testing needed for voice quality.

**Validation:** ✓ SpeakButton on ProblemView (reads question) and WorkedExample (reads instruction + work per step). Math notation converted to speakable text. Auto-selects high-quality English voice. Rate set to 0.9 for young learners.

---

## Phase 3: Speech-to-Text Input (Cloudflare Workers AI Whisper) ✓
**Goal:** Students can speak answers instead of typing

1. [x] [IMP] Add AI binding to existing Worker (`wrangler.toml`: `[ai] binding = "AI"`). Add `POST /api/speech/transcribe` route + `GET /api/speech/status` endpoint
2. [x] [IMP] Create STT composable (`useDictation.ts`): MediaRecorder capture (WebM/Opus), start/stop recording, upload to `/api/speech/transcribe`, return transcript with `spokenToMath()` conversion
3. [x] [IMP] Add VoiceMicButton component to ProblemView answer input: mic icon with recording (red pulse) / processing (spinner) states, transcript appended to answer field
4. [x] [IMP] `spokenToMath()` converts spoken numbers to digits (0-20, tens, hundreds), math words (plus/minus/times/divided by/equals) to symbols
5. [x] [TST] Vitest tests for speech routes: status endpoint, missing file (400), oversized file (413), error handling. All 48 tests pass.

**Validation:** ✓ Full STT pipeline: browser MediaRecorder → FormData upload → Workers AI Whisper → spokenToMath → answer field. VoiceMicButton auto-hides when STT unavailable. Graceful error handling throughout.

---

## Phase 4: Accessibility & Settings
**Goal:** User preferences for speech features

1. [ ] [IMP] Add speech settings to user preferences: enable/disable TTS, enable/disable STT, voice selection, speech rate, auto-read problems on load
2. [ ] [IMP] Integrate with family accounts: parent can configure speech settings per child, default auto-read ON for K-2 grade level
3. [ ] [TST] Verify: settings persist across sessions, per-child settings work in family accounts, ARIA labels on all speech controls

**Validation:** Speech features are configurable per user. Settings persist. Parent can enable auto-read for young children. All speech UI elements are accessible.
