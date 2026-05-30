/**
 * Voice catalogue.
 *
 * Curated ElevenLabs voices suited for YouTube Shorts narration.
 * Each entry includes the voice ID, a human label, and the content
 * styles it works best for so the generator can auto-select by niche.
 *
 * Voice IDs are the stable ElevenLabs pre-made voice IDs.
 * Users can override any selection via ELEVENLABS_VOICE_ID in .env.
 *
 * @typedef {object} VoiceProfile
 * @property {string}   id          — ElevenLabs voice ID
 * @property {string}   name        — human-readable label
 * @property {string}   gender      — 'male' | 'female'
 * @property {string}   accent      — 'american' | 'british' | 'australian'
 * @property {string}   tone        — descriptor used in logs
 * @property {string[]} niches      — niches this voice suits best
 * @property {object}   settings    — default voice_settings for this profile
 */

/** @type {VoiceProfile[]} */
const VOICES = [
  {
    id: '21m00Tcm4TlvDq8ikWAM',
    name: 'Rachel',
    gender: 'female',
    accent: 'american',
    tone: 'calm, professional',
    niches: ['productivity', 'money_facts', 'general'],
    settings: { stability: 0.55, similarity_boost: 0.75, style: 0.35, use_speaker_boost: true },
  },
  {
    id: 'AZnzlk1XvdvUeBnXmlld',
    name: 'Domi',
    gender: 'female',
    accent: 'american',
    tone: 'energetic, confident',
    niches: ['ai_tools', 'tech_facts', 'automation'],
    settings: { stability: 0.45, similarity_boost: 0.80, style: 0.50, use_speaker_boost: true },
  },
  {
    id: 'EXAVITQu4vr4xnSDxMaL',
    name: 'Bella',
    gender: 'female',
    accent: 'american',
    tone: 'warm, engaging',
    niches: ['productivity', 'money_facts'],
    settings: { stability: 0.60, similarity_boost: 0.75, style: 0.30, use_speaker_boost: true },
  },
  {
    id: 'ErXwobaYiN019PkySvjV',
    name: 'Antoni',
    gender: 'male',
    accent: 'american',
    tone: 'deep, authoritative',
    niches: ['money_facts', 'tech_facts', 'automation'],
    settings: { stability: 0.65, similarity_boost: 0.70, style: 0.25, use_speaker_boost: true },
  },
  {
    id: 'MF3mGyEYCl7XYWbV9V6O',
    name: 'Elli',
    gender: 'female',
    accent: 'american',
    tone: 'young, enthusiastic',
    niches: ['ai_tools', 'tech_facts'],
    settings: { stability: 0.40, similarity_boost: 0.85, style: 0.55, use_speaker_boost: true },
  },
  {
    id: 'TxGEqnHWrfWFTfGW9XjX',
    name: 'Josh',
    gender: 'male',
    accent: 'american',
    tone: 'conversational, relatable',
    niches: ['automation', 'productivity', 'general'],
    settings: { stability: 0.50, similarity_boost: 0.75, style: 0.40, use_speaker_boost: true },
  },
  {
    id: 'VR6AewLTigWG4xSOukaG',
    name: 'Arnold',
    gender: 'male',
    accent: 'american',
    tone: 'powerful, dramatic',
    niches: ['money_facts', 'tech_facts'],
    settings: { stability: 0.70, similarity_boost: 0.65, style: 0.20, use_speaker_boost: true },
  },
  {
    id: 'pNInz6obpgDQGcFmaJgB',
    name: 'Adam',
    gender: 'male',
    accent: 'american',
    tone: 'clear, neutral',
    niches: ['ai_tools', 'automation', 'general'],
    settings: { stability: 0.60, similarity_boost: 0.75, style: 0.30, use_speaker_boost: true },
  },
  {
    id: 'yoZ06aMxZJJ28mfd3POQ',
    name: 'Sam',
    gender: 'male',
    accent: 'american',
    tone: 'raspy, intense',
    niches: ['money_facts', 'productivity'],
    settings: { stability: 0.45, similarity_boost: 0.80, style: 0.45, use_speaker_boost: true },
  },
];

/** Default fallback voice ID (Rachel) */
const DEFAULT_VOICE_ID = '21m00Tcm4TlvDq8ikWAM';

/**
 * Find a voice profile by ID.
 * @param {string} voiceId
 * @returns {VoiceProfile|undefined}
 */
function findById(voiceId) {
  return VOICES.find((v) => v.id === voiceId);
}

/**
 * Select the best voice for a given niche.
 * If the env override is set, that voice is always used.
 * Otherwise picks the first catalogue match for the niche,
 * falling back to Rachel.
 *
 * @param {string} [niche]
 * @param {string} [overrideId]  — from config.elevenlabs.voiceId
 * @returns {VoiceProfile}
 */
function selectVoice(niche, overrideId) {
  // Explicit override always wins
  if (overrideId && overrideId !== DEFAULT_VOICE_ID) {
    const found = findById(overrideId);
    if (found) return found;
    // Unknown ID — build a minimal profile so the rest of the code still works
    return {
      id: overrideId,
      name: 'Custom',
      gender: 'unknown',
      accent: 'unknown',
      tone: 'custom',
      niches: [],
      settings: { stability: 0.55, similarity_boost: 0.75, style: 0.35, use_speaker_boost: true },
    };
  }

  if (niche) {
    const match = VOICES.find((v) => v.niches.includes(niche));
    if (match) return match;
  }

  return findById(DEFAULT_VOICE_ID) ?? VOICES[0];
}

module.exports = { VOICES, DEFAULT_VOICE_ID, selectVoice, findById };
