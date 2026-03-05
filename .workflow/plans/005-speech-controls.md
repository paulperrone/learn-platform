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

**Completed:** Phase 1
**In Progress:** —
**Next:** Phase 2

---

## Phase 1: Research & Browser API Spike ✓
**Goal:** Evaluate Web Speech API capabilities and limitations

1. [x] [RSH] Test Web Speech API SpeechSynthesis (TTS) across target browsers (Chrome, Safari, Firefox): voice quality for young learners, math notation pronunciation, language/voice options
2. [x] [RSH] Test Web Speech API SpeechRecognition (STT) across browsers: accuracy for children's voices, number recognition, handling of background noise, browser support gaps (Safari limitations)
3. [x] [RSH] Evaluate external service fallbacks: ElevenLabs (TTS quality/cost), Deepgram (STT accuracy/cost), Cloudflare Workers AI (any speech models available). Document trade-offs in RESEARCH.md.

**Validation:** ✓ RESEARCH.md entry with browser compatibility matrix, quality assessment, and recommended approach.
**Decision:** TTS = browser-native SpeechSynthesis (free, good support). STT = Cloudflare Workers AI Whisper large-v3-turbo (proven pattern from assistant project, $0.00051/min, all-browser support via MediaRecorder upload, AI binding in existing Worker).

---

## Phase 2: Text-to-Speech Integration
**Goal:** Problems and worked examples can be read aloud

1. [ ] [IMP] Create TTS composable (`useSpeech.ts`): wrap SpeechSynthesis API, handle voice selection, rate/pitch control, queue management for multi-sentence content
2. [ ] [IMP] Add read-aloud button to ProblemView and WorkedExample components: speaker icon, play/pause/stop, highlight current sentence being read
3. [ ] [IMP] Handle math content in TTS: convert math notation to speakable text (e.g., "3 + 5 = ?" → "three plus five equals what?"), number word conversion for young learners
4. [ ] [TST] Verify: problems read aloud correctly across Chrome/Safari, math is spoken naturally, controls work (play/pause/stop), voice is age-appropriate

**Validation:** K-2 student can hear any problem read aloud by clicking a button. Math notation is spoken correctly. Works on Chrome and Safari (primary targets).

---

## Phase 3: Speech-to-Text Input (Cloudflare Workers AI Whisper)
**Goal:** Students can speak answers instead of typing

1. [ ] [IMP] Add AI binding to existing Worker (`wrangler.toml`: `[ai] binding = "AI"`). Add `POST /api/speech/transcribe` route: accept FormData audio, convert to base64, call `env.AI.run('@cf/openai/whisper-large-v3-turbo', { audio })`, return `{ success, text }`
2. [ ] [IMP] Create STT composable (`useDictation.ts`): MediaRecorder capture (WebM/Opus), start/stop recording, upload to `/api/speech/transcribe`, return transcript. Pattern from `~/source/assistant` VoiceMicButton.vue
3. [ ] [IMP] Add speech input mode to answer fields: microphone button (VoiceMicButton component), visual feedback (pulsing indicator while recording, spinner while processing), transcript preview with edit-before-submit
4. [ ] [IMP] Handle number and math input via speech: convert spoken numbers to digits ("twenty three" → "23"), basic math terms ("plus" → "+", "equals" → "=")
5. [ ] [TST] Verify: student speaks answer → audio uploads → transcript appears → can edit → submit. Number conversion works. Graceful fallback when AI binding unavailable (hide mic button). Vitest tests for transcribe route.

**Validation:** Student can answer problems by speaking. Numbers and basic math terms are converted correctly. Works on all browsers (MediaRecorder + server-side Whisper). Degrades gracefully when STT unavailable.

---

## Phase 4: Accessibility & Settings
**Goal:** User preferences for speech features

1. [ ] [IMP] Add speech settings to user preferences: enable/disable TTS, enable/disable STT, voice selection, speech rate, auto-read problems on load
2. [ ] [IMP] Integrate with family accounts: parent can configure speech settings per child, default auto-read ON for K-2 grade level
3. [ ] [TST] Verify: settings persist across sessions, per-child settings work in family accounts, ARIA labels on all speech controls

**Validation:** Speech features are configurable per user. Settings persist. Parent can enable auto-read for young children. All speech UI elements are accessible.
