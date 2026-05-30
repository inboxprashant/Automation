/**
 * Topic bank — curated prompts per niche.
 *
 * Each topic entry has:
 *   niche      — category label
 *   angle      — specific story angle to keep scripts fresh
 *   keywords   — seeded into the prompt for SEO-aware generation
 *   style      — tone instruction for the prompt
 *
 * The generator picks one at random (or by niche filter) so every
 * run produces a different script even within the same category.
 */

/** @typedef {{ niche: string, angle: string, keywords: string[], style: string }} Topic */

/** @type {Topic[]} */
const TOPICS = [
  // ── AI Tools ────────────────────────────────────────────────────────────
  {
    niche: 'ai_tools',
    angle: 'A little-known AI tool that replaces an entire job role',
    keywords: ['AI tool', 'automation', 'replace jobs', 'ChatGPT alternative', 'productivity'],
    style: 'shocking and eye-opening',
  },
  {
    niche: 'ai_tools',
    angle: 'How to use AI to write a week of content in 10 minutes',
    keywords: ['AI writing', 'content creation', 'ChatGPT', 'time saving', 'creator tools'],
    style: 'practical and fast-paced',
  },
  {
    niche: 'ai_tools',
    angle: 'The AI tool that reads your screen and does tasks for you',
    keywords: ['AI agent', 'computer use', 'automation', 'Claude', 'OpenAI'],
    style: 'futuristic and mind-blowing',
  },
  {
    niche: 'ai_tools',
    angle: 'Free AI tools most people have never heard of',
    keywords: ['free AI', 'hidden tools', 'AI apps', 'no cost', 'underrated'],
    style: 'list-style, punchy',
  },
  {
    niche: 'ai_tools',
    angle: 'How AI image generation changed overnight with one update',
    keywords: ['AI art', 'Midjourney', 'DALL-E', 'image generation', 'creative AI'],
    style: 'dramatic and visual',
  },

  // ── Tech Facts ──────────────────────────────────────────────────────────
  {
    niche: 'tech_facts',
    angle: 'A mind-blowing fact about how the internet actually works',
    keywords: ['internet', 'data centers', 'undersea cables', 'tech infrastructure', 'how it works'],
    style: 'educational and surprising',
  },
  {
    niche: 'tech_facts',
    angle: 'The insane amount of data generated every single minute',
    keywords: ['big data', 'internet statistics', 'data per minute', 'digital world', 'tech facts'],
    style: 'fast numbers, high energy',
  },
  {
    niche: 'tech_facts',
    angle: 'Why your smartphone is more powerful than NASA computers from 1969',
    keywords: ['smartphone power', 'NASA', 'computing history', 'Moore\'s law', 'tech evolution'],
    style: 'comparative and awe-inspiring',
  },
  {
    niche: 'tech_facts',
    angle: 'The hidden cost of keeping your phone plugged in overnight',
    keywords: ['phone battery', 'electricity cost', 'charging habits', 'tech tips', 'money saving'],
    style: 'practical and relatable',
  },
  {
    niche: 'tech_facts',
    angle: 'How quantum computing will break all current encryption',
    keywords: ['quantum computing', 'encryption', 'cybersecurity', 'future tech', 'RSA'],
    style: 'urgent and thought-provoking',
  },

  // ── Automation ──────────────────────────────────────────────────────────
  {
    niche: 'automation',
    angle: 'How to automate your morning routine with free tools',
    keywords: ['automation', 'Zapier', 'Make', 'morning routine', 'productivity hacks'],
    style: 'actionable and motivating',
  },
  {
    niche: 'automation',
    angle: 'The no-code automation that saves 10 hours a week',
    keywords: ['no-code', 'workflow automation', 'time saving', 'Zapier', 'n8n'],
    style: 'practical step-by-step',
  },
  {
    niche: 'automation',
    angle: 'How one Python script replaced a $50k/year employee',
    keywords: ['Python automation', 'scripting', 'replace jobs', 'coding', 'business automation'],
    style: 'controversial and bold',
  },
  {
    niche: 'automation',
    angle: 'Automating social media posts while you sleep',
    keywords: ['social media automation', 'scheduling', 'Buffer', 'passive growth', 'content'],
    style: 'aspirational and practical',
  },
  {
    niche: 'automation',
    angle: 'The automation stack used by 6-figure solopreneurs',
    keywords: ['solopreneur', 'automation stack', 'tools', 'business systems', 'scale'],
    style: 'aspirational and list-driven',
  },

  // ── Money Facts ─────────────────────────────────────────────────────────
  {
    niche: 'money_facts',
    angle: 'Why 90% of people will never build wealth (and the fix)',
    keywords: ['wealth building', 'financial literacy', 'money mindset', 'investing', 'savings'],
    style: 'provocative and empowering',
  },
  {
    niche: 'money_facts',
    angle: 'The compound interest trick banks don\'t want you to know',
    keywords: ['compound interest', 'investing', 'savings', 'financial tips', 'money growth'],
    style: 'conspiratorial and eye-opening',
  },
  {
    niche: 'money_facts',
    angle: 'How inflation silently steals your money every year',
    keywords: ['inflation', 'purchasing power', 'money facts', 'economy', 'financial education'],
    style: 'alarming and educational',
  },
  {
    niche: 'money_facts',
    angle: 'The $5 daily habit that costs you $50,000 over 10 years',
    keywords: ['latte factor', 'small expenses', 'money habits', 'financial planning', 'savings'],
    style: 'relatable and shocking',
  },
  {
    niche: 'money_facts',
    angle: 'Why the rich pay less tax than the middle class',
    keywords: ['tax strategy', 'wealth', 'tax loopholes', 'financial system', 'money facts'],
    style: 'controversial and informative',
  },

  // ── Productivity ────────────────────────────────────────────────────────
  {
    niche: 'productivity',
    angle: 'The 2-minute rule that eliminates procrastination instantly',
    keywords: ['2-minute rule', 'procrastination', 'GTD', 'productivity hack', 'David Allen'],
    style: 'actionable and direct',
  },
  {
    niche: 'productivity',
    angle: 'Why working 4 hours beats working 8 hours every time',
    keywords: ['deep work', 'Parkinson\'s law', 'focus', 'time management', 'productivity'],
    style: 'counterintuitive and bold',
  },
  {
    niche: 'productivity',
    angle: 'The morning routine of the world\'s most productive people',
    keywords: ['morning routine', 'successful habits', 'Elon Musk', 'Tim Cook', 'productivity'],
    style: 'aspirational and fast-paced',
  },
  {
    niche: 'productivity',
    angle: 'How to get more done in 2 hours than most do in a full day',
    keywords: ['time blocking', 'deep work', 'focus mode', 'Cal Newport', 'productivity system'],
    style: 'practical and energetic',
  },
  {
    niche: 'productivity',
    angle: 'The single habit that separates top performers from everyone else',
    keywords: ['high performance', 'habits', 'discipline', 'success mindset', 'daily routine'],
    style: 'motivational and punchy',
  },
];

/** All valid niche identifiers */
const NICHES = [...new Set(TOPICS.map((t) => t.niche))];

/**
 * Get a random topic, optionally filtered by niche.
 * Falls back to a fully random topic if the niche has no matches.
 *
 * @param {string} [niche]
 * @returns {Topic}
 */
function pickTopic(niche) {
  const pool = niche ? TOPICS.filter((t) => t.niche === niche) : TOPICS;
  const source = pool.length > 0 ? pool : TOPICS;
  return source[Math.floor(Math.random() * source.length)];
}

/**
 * Map legacy TOPIC_CATEGORY values to niche identifiers.
 * Keeps backward compatibility with the existing config.
 *
 * @param {string} category
 * @returns {string}
 */
function resolveNiche(category) {
  const map = {
    tech: 'tech_facts',
    finance: 'money_facts',
    motivation: 'productivity',
    facts: 'tech_facts',
    health: 'productivity',
    history: 'tech_facts',
    // direct matches pass through
    ai_tools: 'ai_tools',
    tech_facts: 'tech_facts',
    automation: 'automation',
    money_facts: 'money_facts',
    productivity: 'productivity',
  };
  return map[category] || null; // null → fully random
}

module.exports = { TOPICS, NICHES, pickTopic, resolveNiche };
