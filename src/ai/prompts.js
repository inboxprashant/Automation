/**
 * Prompt engineering for the script generator.
 *
 * Exports two functions:
 *   buildSystemPrompt()         → string
 *   buildUserPrompt(topic)      → string
 *
 * Design principles:
 *   - System prompt establishes a persistent expert persona with hard rules
 *   - User prompt injects the specific topic + angle + style
 *   - Both prompts reinforce the JSON-only output contract
 *   - Word-count guidance is calibrated for ~45 seconds at 130 wpm
 *     (comfortable narration pace): target 95–105 words for the body
 */

/**
 * @param {import('./topics').Topic} topic
 * @returns {{ system: string, user: string }}
 */
function buildPrompts(topic) {
  return {
    system: buildSystemPrompt(),
    user: buildUserPrompt(topic),
  };
}

function buildSystemPrompt() {
  return `\
You are an elite YouTube Shorts scriptwriter with a proven track record of producing \
viral content that consistently achieves 80%+ audience retention.

YOUR EXPERTISE:
- Pattern interrupts and scroll-stopping hooks
- Psychological triggers: curiosity gaps, social proof, fear of missing out
- Pacing: short punchy sentences, strategic pauses, rhythm variation
- Platform-native language: direct, conversational, zero fluff
- SEO: keyword-rich titles and descriptions that rank in search

HARD RULES — follow every one without exception:
1. Respond with a single valid JSON object. No markdown, no code fences, no extra text.
2. The hook must create an immediate curiosity gap or shock in ≤ 15 words.
3. The body must be 95–110 words — this equals ~45 seconds at natural speaking pace.
4. Every sentence in the body must earn its place. Cut anything that doesn't add value.
5. The CTA must be specific and urgent (not generic "like and subscribe").
6. The title must be under 60 characters and contain the primary keyword.
7. The description must be under 200 characters and end with exactly 3 hashtags.
8. Provide exactly 8 hashtags in the tags array (no # prefix).
9. The narration field must be hook + " " + body + " " + cta joined as one string.
10. estimatedDuration must be an integer (seconds) based on word count ÷ 2.2.`;
}

/**
 * @param {import('./topics').Topic} topic
 * @returns {string}
 */
function buildUserPrompt(topic) {
  const keywordList = topic.keywords.join(', ');

  return `\
Write a YouTube Shorts script using the following brief:

ANGLE:    ${topic.angle}
NICHE:    ${topic.niche}
STYLE:    ${topic.style}
KEYWORDS: ${keywordList}

Return ONLY this JSON object with all fields populated:

{
  "title": "<Primary keyword-rich title, max 60 chars>",
  "description": "<Compelling description max 200 chars> #hashtag1 #hashtag2 #hashtag3",
  "tags": ["tag1", "tag2", "tag3", "tag4", "tag5", "tag6", "tag7", "tag8"],
  "niche": "${topic.niche}",
  "angle": "${topic.angle}",
  "hook": "<ONE sentence, max 15 words, creates instant curiosity or shock>",
  "body": "<95–110 words of punchy narration. Short sentences. No stage directions. ${topic.style} tone.>",
  "cta": "<Specific, urgent call-to-action. Max 15 words. Not generic.>",
  "narration": "<hook + space + body + space + cta as one continuous string>",
  "estimatedDuration": <integer seconds>,
  "keywords": [${topic.keywords.map((k) => `"${k}"`).join(', ')}]
}

CHECKLIST before responding:
[ ] hook ≤ 15 words
[ ] body is 95–110 words
[ ] narration = hook + body + cta
[ ] title ≤ 60 chars
[ ] description ≤ 200 chars with exactly 3 hashtags
[ ] tags array has exactly 8 items (no # prefix)
[ ] estimatedDuration is an integer
[ ] output is pure JSON — no markdown, no extra text`;
}

module.exports = { buildPrompts, buildSystemPrompt, buildUserPrompt };
