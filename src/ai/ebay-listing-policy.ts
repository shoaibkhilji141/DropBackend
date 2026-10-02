export type PolicySeverity = 'prohibited' | 'restricted' | 'risk';
export type PolicyVerdict = 'list' | 'review' | 'do_not_list';
export type CheckStatus = 'pass' | 'flag' | 'fail';

export interface PolicyViolation {
  policy: string;
  severity: PolicySeverity;
  reason: string;
  evidence?: string;
}

export interface PolicyAreaCheck {
  area: string;
  status: CheckStatus;
  note: string;
}

export interface ListingPolicyCheck {
  verdict: PolicyVerdict;
  shouldList: boolean;
  summary: string;
  score: number;
  confidence: number;
  violations: PolicyViolation[];
  requirements: string[];
  checks: PolicyAreaCheck[];
}

interface PolicyInput {
  title: string;
  description?: string;
  category?: string;
  specs?: string[];
  variants?: string[];
  generatedTitle?: string;
  generatedDescription?: string;
  costPrice?: number;
  currency?: string;
}

interface PatternRule {
  area: string;
  policy: string;
  severity: PolicySeverity;
  pattern: RegExp;
  reason: string;
}

const POLICY_URL =
  'https://www.ebay.co.uk/help/policies/prohibited-restricted-items/prohibited-restricted-items?id=4207';

const AREAS = [
  'Prohibited items',
  'Weapons and knives',
  'Firearms and replicas',
  'Replica and counterfeit',
  'Branded / VeRO IP',
  'Medicines and health claims',
  'Tobacco, vapes, alcohol',
  'Electrical and UK safety',
  'Toys, cosmetics, children',
  'Adult and offensive',
  'Hazardous and batteries',
  'Listing claims',
] as const;

const LUXURY_BRANDS =
  'gucci|louis\\s*vuitton|\\blv\\b|chanel|hermes|hermès|dior|prada|balenciaga|fendi|givenchy|ysl|saint\\s*laurent|rolex|omega|patek|cartier|audemars|richard\\s*mille|tiffany';
const SPORTS_BRANDS = 'nike|adidas|jordan|yeezy|new\\s*balance|puma|under\\s*armour';
const TECH_BRANDS =
  'apple|iphone|ipad|airpods|macbook|samsung|sony|dyson|bose|beats|gopro|nintendo|playstation|xbox';

const PATTERN_RULES: PatternRule[] = [
  {
    area: 'Weapons and knives',
    policy: 'Weapons',
    severity: 'prohibited',
    pattern:
      /\b(taser|stun\s*gun|pepper\s*spray|mace\s*spray|brass\s*knuckle|knuckle\s*duster|nunchaku|nunchuck|switchblade|stiletto|machete|karambit|balisong|butterfly\s*knife|throwing\s*star|shuriken|crossbow|blowgun|slingshot|baton|nightstick|extendable\s*baton|cs\s*gas|tear\s*gas)\b/i,
    reason: 'Offensive weapons, sprays and striking weapons are banned on ebay.co.uk.',
  },
  {
    area: 'Weapons and knives',
    policy: 'Knives',
    severity: 'prohibited',
    pattern:
      /\b(combat\s*knife|tactical\s*knife|hunting\s*knife|survival\s*knife|dagger|dirk|sword|katana|wakizashi|bayonet|throwing\s*knife|automatic\s*knife|otf\s*knife|push\s*dagger|karambit)\b/i,
    reason: 'Most knives and bladed weapons are prohibited on ebay.co.uk.',
  },
  {
    area: 'Firearms and replicas',
    policy: 'Firearms and replicas',
    severity: 'prohibited',
    pattern:
      /\b(firearm|handgun|pistol|rifle|shotgun|revolver|airsoft|bb\s*gun|air\s*rifle|air\s*pistol|pellet\s*gun|replica\s*(gun|pistol|firearm|blaster)|imitation\s*firearm|paintball\s*gun|cap\s*gun|gel\s*blaster|orphan\s*parts)\b/i,
    reason: 'Firearms, airsoft/BB guns, gel blasters and replica guns cannot be listed on ebay.co.uk.',
  },
  {
    area: 'Replica and counterfeit',
    policy: 'Counterfeit language',
    severity: 'prohibited',
    pattern:
      /\b(replica|counterfeit|super\s*clone|clone\s*watch|1\s*:\s*1|aaa\s*quality|aaaa|mirror\s*quality|perfect\s*mirror|inspired\s*by|dupe\b|homage\s*watch|not\s*original\s*but|fake\s+(nike|adidas|gucci|rolex|lv|louis)|unbranded\s*replica)\b/i,
    reason: 'Replica, clone, homage and “dupe” wording is a counterfeit policy violation.',
  },
  {
    area: 'Medicines and health claims',
    policy: 'Medicines and drugs',
    severity: 'prohibited',
    pattern:
      /\b(prescription|viagra|cialis|sildenafil|tramadol|modafinil|steroid|anabolic|injectable|semaglutide|ozempic|pharmacy|otc\s*drug|weight\s*loss\s*pills|diet\s*pills|cbd\s*oil|thc|cannabis|kratom|melatonin\s*gummies|retin[- ]?a)\b/i,
    reason: 'Prescription drugs, many medicines, CBD/THC and injectables are not allowed.',
  },
  {
    area: 'Medicines and health claims',
    policy: 'Medical claims',
    severity: 'restricted',
    pattern:
      /\b(cures?|treats?\s+(cancer|covid|diabetes|arthritis)|clinically\s*proven|fda\s*approved|mhra\s*approved|miracle\s*(cure|pill)|anti[- ]?covid)\b/i,
    reason: 'Disease-treatment and unproven medical claims are not allowed in eBay listings.',
  },
  {
    area: 'Tobacco, vapes, alcohol',
    policy: 'Tobacco and vapes',
    severity: 'prohibited',
    pattern:
      /\b(cigarette|cigar|tobacco|vape|vaping|e-?cigarette|e-?liquid|e-?juice|nicotine|elf\s*bar|disposable\s*vape|hookah\s*tobacco|shisha)\b/i,
    reason: 'Tobacco and most nicotine vape products are prohibited on ebay.co.uk.',
  },
  {
    area: 'Tobacco, vapes, alcohol',
    policy: 'Alcohol',
    severity: 'prohibited',
    pattern: /\b(whisky|whiskey|vodka|tequila|champagne|rum\b|wine\s*bottle|alcohol\s*(drink|beverage)|spirits\s*bottle)\b/i,
    reason: 'Alcohol cannot be sold by a typical dropshipping account on ebay.co.uk.',
  },
  {
    area: 'Prohibited items',
    policy: 'Crime tools and IDs',
    severity: 'prohibited',
    pattern:
      /\b(passport|id\s*hologram|id\s*card\s*template|credit\s*card\s*skimmer|lock\s*pick|lockpick|bump\s*key|hidden\s*spy\s*camera|wiretap|signal\s*jammer|gps\s*jammer|car\s*key\s*programmer|key\s*cloner)\b/i,
    reason: 'IDs, lock picks, jammers and covert crime tools are prohibited.',
  },
  {
    area: 'Prohibited items',
    policy: 'Digital goods and accounts',
    severity: 'prohibited',
    pattern:
      /\b(shared\s*netflix|spotify\s*premium\s*account|iptv\s*subscription|game\s*key\s*cd|windows\s*10\s*license\s*key|activation\s*key\s*cheap|gift\s*card\s*code)\b/i,
    reason: 'Account sharing, IPTV and unauthorised software keys violate eBay digital goods rules.',
  },
  {
    area: 'Hazardous and batteries',
    policy: 'Hazardous goods',
    severity: 'restricted',
    pattern:
      /\b(hoverboard|self[\s-]?balancing\s*scooter|e-?scooter|firework|explosive|pepper\s*ammo|loose\s*lithium|battery\s*pack\s*100ah|powerful\s*magnet|neodymium)\b/i,
    reason: 'Some battery, magnet and hazardous products need extra checks or are banned.',
  },
  {
    area: 'Electrical and UK safety',
    policy: 'Electrical / UKCA',
    severity: 'restricted',
    pattern:
      /\b(uk\s*plug|bs\s*1363|ukca|ce\s*mark|mains\s*powered|220v|240v|extension\s*lead|travel\s*adaptor|charger\s*block)\b/i,
    reason: 'Mains electrical goods need UKCA/CE evidence and a correct UK plug for ebay.co.uk.',
  },
  {
    area: 'Toys, cosmetics, children',
    policy: 'Toys and cosmetics',
    severity: 'restricted',
    pattern:
      /\b(for\s*ages?\s*0|under\s*3\s*years|baby\s*teether|used\s*makeup|used\s*cosmetic|lash\s*growth\s*serum|en71|toy\s*gun)\b/i,
    reason: 'Toys and cosmetics have UK safety labelling rules; used cosmetics are often banned.',
  },
  {
    area: 'Adult and offensive',
    policy: 'Adult items',
    severity: 'restricted',
    pattern: /\b(sex\s*toy|dildo|vibrator|adult\s*toy|porn|xxx|masturbat)\b/i,
    reason: 'Adult items have listing restrictions and category rules on ebay.co.uk.',
  },
  {
    area: 'Listing claims',
    policy: 'Misleading claims',
    severity: 'risk',
    pattern:
      /\b(military\s*grade|guaranteed\s*original|authentic\s*brand|official\s*retailer|100%\s*genuine\s*brand|oem\s*original|authorised\s*dealer)\b/i,
    reason: 'Authenticity and official-dealer claims need proof. Dropshipping listings usually cannot make them.',
  },
];

export function scanEbayUkPolicy(input: PolicyInput): ListingPolicyCheck {
  const haystack = buildHaystack(input);
  const violations: PolicyViolation[] = [];

  for (const rule of PATTERN_RULES) {
    const evidence = firstMatch(haystack, rule.pattern);
    if (!evidence) continue;
    if (rule.area === 'Electrical and UK safety') continue;
    violations.push({
      policy: rule.policy,
      severity: rule.severity,
      reason: rule.reason,
      evidence,
    });
  }

  violations.push(...brandViolations(haystack, input.costPrice));
  violations.push(...electricalReview(haystack));
  violations.push(...knifeGenericReview(haystack, violations));

  return finalizePolicy(violations, defaultRequirements(), undefined, undefined, 70);
}

export function parseAiPolicy(payload: Record<string, unknown>): ListingPolicyCheck | null {
  const raw = payload.policy ?? payload;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const policy = raw as Record<string, unknown>;
  if (!policy.verdict && !policy.violations && !policy.summary) return null;

  const verdict = normalizeVerdict(policy.verdict ?? policy.recommendation);
  const violations = Array.isArray(policy.violations)
    ? policy.violations
        .map((row): PolicyViolation | null => {
          if (!row || typeof row !== 'object' || Array.isArray(row)) return null;
          const item = row as Record<string, unknown>;
          const name = typeof item.policy === 'string' ? item.policy.trim() : '';
          const reason = typeof item.reason === 'string' ? item.reason.trim() : '';
          if (!name || !reason) return null;
          const evidence = typeof item.evidence === 'string' ? item.evidence.trim().slice(0, 80) : undefined;
          return {
            policy: name.slice(0, 80),
            severity: normalizeSeverity(item.severity),
            reason: reason.slice(0, 400),
            evidence,
          };
        })
        .filter((item): item is PolicyViolation => item !== null)
        .slice(0, 12)
    : [];
  const requirements = Array.isArray(policy.requirements)
    ? policy.requirements
        .filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
        .map((item) => item.trim().slice(0, 220))
        .slice(0, 10)
    : [];
  const summary =
    typeof policy.summary === 'string' && policy.summary.trim() ? policy.summary.trim().slice(0, 500) : '';
  const confidence = clampNumber(policy.confidence, 40, 95) ?? 60;
  return finalizePolicy(violations, requirements, verdict, summary, confidence);
}

export function mergePolicy(ruleCheck: ListingPolicyCheck, aiCheck: ListingPolicyCheck | null): ListingPolicyCheck {
  if (!aiCheck) return ruleCheck;
  const seen = new Set(ruleCheck.violations.map((item) => keyOf(item)));
  const violations = [...ruleCheck.violations];
  for (const item of aiCheck.violations) {
    const key = keyOf(item);
    if (seen.has(key)) continue;
    seen.add(key);
    violations.push(item);
  }
  const requirements = unique([
    ...ruleCheck.requirements.filter((item) => !item.startsWith('Policies:')),
    ...aiCheck.requirements,
  ]).slice(0, 10);
  const confidence = Math.max(ruleCheck.confidence, aiCheck.confidence);
  return finalizePolicy(violations, requirements, aiCheck.verdict, aiCheck.summary, confidence);
}

export function policyReviewPrompt(input: PolicyInput & { generatedTitle: string; generatedDescription: string }): {
  system: string;
  user: string;
} {
  return {
    system: [
      'You are a strict ebay.co.uk compliance reviewer for a UK AliExpress-to-eBay dropshipper.',
      'Be conservative. If unsure, verdict is review. Say list ONLY for generic, unbranded, non-regulated consumer goods.',
      'Never approve: weapons, knives, replica/fake/dupe goods, medicines, vapes, alcohol, luxury brand goods, Nike/Adidas shoes or apparel, Apple/Samsung devices sold as genuine, software keys, or hidden cameras.',
      'Branded goods bought from AliExpress are usually unauthorised and a VeRO risk — verdict review or do_not_list.',
      'Return JSON only: {"verdict":"list|review|do_not_list","summary":"...","confidence":0-100,"violations":[{"policy":"...","severity":"prohibited|restricted|risk","reason":"...","evidence":"..."}],"requirements":["..."]}.',
      'Include every real issue. Empty violations only when the item is clearly a generic allowed product.',
    ].join(' '),
    user: [
      'Review this product for ebay.co.uk listing. Decide if the seller should list it.',
      `Source title: ${input.title}`,
      `Category: ${input.category || 'unknown'}`,
      input.costPrice != null ? `AliExpress cost: ${input.costPrice} ${input.currency || ''}`.trim() : '',
      input.specs?.length ? `Specs:\n${input.specs.slice(0, 16).join('\n')}` : '',
      input.variants?.length ? `Variants: ${input.variants.join('; ')}` : '',
      input.description ? `Source description:\n${input.description.slice(0, 2500)}` : '',
      `Draft eBay title: ${input.generatedTitle}`,
      `Draft eBay description:\n${input.generatedDescription.slice(0, 2000)}`,
    ]
      .filter(Boolean)
      .join('\n'),
  };
}

function brandViolations(haystack: string, costPrice?: number): PolicyViolation[] {
  const found: PolicyViolation[] = [];
  const luxury = firstMatch(haystack, new RegExp(`\\b(${LUXURY_BRANDS})\\b`, 'i'));
  const sports = firstMatch(haystack, new RegExp(`\\b(${SPORTS_BRANDS})\\b`, 'i'));
  const tech = firstMatch(haystack, new RegExp(`\\b(${TECH_BRANDS})\\b`, 'i'));
  const apparel = /\b(shoe|shoes|sneaker|trainer|hoodie|jersey|t-?shirt|tracksuit|handbag|wallet|belt|watch)\b/i.test(
    haystack,
  );
  const device =
    /\b(iphone|ipad|airpods|macbook|galaxy\s*(s|z|watch|bud)|playstation|xbox|switch\b|dyson)\b/i.test(haystack);

  if (luxury) {
    const accessory = isAccessoryFor(haystack, luxury);
    found.push({
      policy: 'Luxury brand / VeRO',
      severity: accessory ? 'restricted' : 'prohibited',
      reason: accessory
        ? `“${luxury}” appears as an accessory fitment. Logo goods and implied authenticity still get VeRO strikes.`
        : `“${luxury}” goods from AliExpress are treated as unauthorised or counterfeit on ebay.co.uk. Do not list.`,
      evidence: luxury,
    });
    if (!accessory && costPrice != null && costPrice < 150) {
      found.push({
        policy: 'Likely counterfeit price',
        severity: 'prohibited',
        reason: `AliExpress cost ${costPrice} is far too low for genuine ${luxury}. eBay will treat this as a fake.`,
        evidence: String(costPrice),
      });
    }
  }

  if (sports && apparel) {
    found.push({
      policy: 'Sports brand apparel',
      severity: 'prohibited',
      reason: `“${sports}” shoes or clothing from AliExpress are almost never authorised stock. High VeRO / counterfeit risk.`,
      evidence: sports,
    });
  } else if (sports && !isAccessoryFor(haystack, sports)) {
    found.push({
      policy: 'Sports brand',
      severity: 'restricted',
      reason: `“${sports}” is a protected brand. Only list if you can prove authentic authorised stock.`,
      evidence: sports,
    });
  }

  if (tech && device && !isAccessoryFor(haystack, tech)) {
    found.push({
      policy: 'Branded electronics',
      severity: 'prohibited',
      reason: `Listing “${tech}” devices as new genuine product from AliExpress is a counterfeit / VeRO risk.`,
      evidence: tech,
    });
  } else if (tech) {
    found.push({
      policy: 'Branded accessory',
      severity: 'risk',
      reason: `“${tech}” in the listing can still trigger VeRO if photos or title imply an official product. Use “compatible with”, no logos.`,
      evidence: tech,
    });
  }

  return found;
}

function electricalReview(haystack: string): PolicyViolation[] {
  const electrical =
    /\b(charger|adapter|adaptor|plug|lamp|light\s*bulb|extension|heater|kettle|hair\s*dryer|straighteners?|power\s*bank|led\s*strip)\b/i.test(
      haystack,
    );
  if (!electrical) return [];
  const ukSafe = /\b(uk\s*plug|bs\s*1363|ukca|three\s*pin)\b/i.test(haystack);
  if (ukSafe) {
    return [
      {
        policy: 'Electrical / UKCA',
        severity: 'risk',
        reason: 'Keep UK plug and UKCA/CE proof. Do not claim safety marks you cannot show.',
        evidence: firstMatch(haystack, /\b(uk\s*plug|ukca|bs\s*1363)\b/i),
      },
    ];
  }
  return [
    {
      policy: 'Electrical / UKCA',
      severity: 'restricted',
      reason: 'Mains or charging products for ebay.co.uk need a UK 3-pin plug and UKCA/CE evidence. Confirm before listing.',
      evidence: firstMatch(haystack, /\b(charger|adapter|lamp|heater|kettle|power\s*bank)\b/i),
    },
  ];
}

function knifeGenericReview(haystack: string, existing: PolicyViolation[]): PolicyViolation[] {
  if (existing.some((item) => item.policy === 'Knives' || item.policy === 'Weapons')) return [];
  if (!/\b(knife|knives|blade|cutter)\b/i.test(haystack)) return [];
  if (/\b(kitchen\s*knife|chef(?:'s)?\s*knife|steak\s*knife|bread\s*knife|utility\s*knife|box\s*cutter|craft\s*knife)\b/i.test(haystack)) {
    return [
      {
        policy: 'Kitchen / utility blade',
        severity: 'restricted',
        reason: 'Some kitchen and craft blades are allowed, others are not. Check the ebay.co.uk knives policy before listing.',
        evidence: firstMatch(haystack, /\b((?:kitchen|chef(?:'s)?|steak|bread|utility|craft)\s*knife|box\s*cutter)\b/i),
      },
    ];
  }
  return [
    {
      policy: 'Unspecified knife',
      severity: 'prohibited',
      reason: 'A knife listing without a clear permitted type is unsafe. Most knives are prohibited on ebay.co.uk.',
      evidence: firstMatch(haystack, /\b(knife|knives|blade)\b/i),
    },
  ];
}

function isAccessoryFor(text: string, brand: string): boolean {
  const safe = brand.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(
    `(?:for|fits|compatible(?:\\s+with)?|case|cover|charger|cable|strap|band|holder|mount|skin|protector|replacement).{0,28}${safe}|${safe}.{0,28}(?:case|cover|charger|cable|strap|band|holder|compatible)`,
    'i',
  ).test(text);
}

function buildHaystack(input: PolicyInput): string {
  return [
    input.title,
    input.generatedTitle,
    input.category,
    input.description,
    input.generatedDescription,
    ...(input.specs ?? []),
    ...(input.variants ?? []),
  ]
    .filter(Boolean)
    .join('\n')
    .slice(0, 16_000);
}

function firstMatch(text: string, pattern: RegExp): string | undefined {
  const match = pattern.exec(text);
  return match?.[0]?.trim().slice(0, 80);
}

function finalizePolicy(
  violations: PolicyViolation[],
  requirements: string[],
  preferredVerdict?: PolicyVerdict,
  preferredSummary?: string,
  confidence = 70,
): ListingPolicyCheck {
  const hasProhibited = violations.some((item) => item.severity === 'prohibited');
  const cautionCount = violations.filter((item) => item.severity !== 'prohibited').length;
  const score = clamp(
    100 - violations.filter((item) => item.severity === 'prohibited').length * 35 - cautionCount * 12,
    0,
    100,
  );

  let verdict: PolicyVerdict = 'list';
  if (hasProhibited || score < 40 || preferredVerdict === 'do_not_list') verdict = 'do_not_list';
  else if (cautionCount > 0 || score < 75 || preferredVerdict === 'review') {
    verdict = 'review';
  }

  const summary =
    preferredSummary && (verdict !== 'list' || preferredVerdict === 'list')
      ? preferredSummary
      : verdict === 'do_not_list'
        ? 'Do not list this on ebay.co.uk. It hits a prohibited or high-risk policy for a UK dropshipping seller.'
        : verdict === 'review'
          ? 'Do not list yet. Fix or prove the issues below, or choose another product.'
          : 'No hard ebay.co.uk block was found. Still do not invent brands, certificates or delivery times.';

  return {
    verdict,
    shouldList: verdict === 'list',
    summary,
    score,
    confidence: clamp(confidence, 30, 99),
    violations,
    requirements: unique([...requirements, `Full policy list: ${POLICY_URL}`]).slice(0, 10),
    checks: buildChecks(violations),
  };
}

function buildChecks(violations: PolicyViolation[]): PolicyAreaCheck[] {
  return AREAS.map((area) => {
    const hits = violations.filter((item) => areaOf(item) === area);
    if (hits.some((item) => item.severity === 'prohibited')) {
      return { area, status: 'fail', note: hits[0].reason };
    }
    if (hits.length) return { area, status: 'flag', note: hits[0].reason };
    return { area, status: 'pass', note: 'No match in title, specs or description.' };
  });
}

function areaOf(item: PolicyViolation): string {
  const mapped = PATTERN_RULES.find((rule) => rule.policy === item.policy)?.area;
  if (mapped) return mapped;
  if (/vero|brand|luxury|sports|electronics|accessory/i.test(item.policy)) return 'Branded / VeRO IP';
  if (/counterfeit|replica|fake|price/i.test(item.policy)) return 'Replica and counterfeit';
  if (/knife|weapon/i.test(item.policy)) return 'Weapons and knives';
  if (/electrical|ukca|plug/i.test(item.policy)) return 'Electrical and UK safety';
  if (/claim/i.test(item.policy)) return 'Listing claims';
  return 'Prohibited items';
}

function defaultRequirements(): string[] {
  return [
    'Do not use replica, 1:1, dupe, clone, or “inspired by” wording.',
    'Do not claim official, authentic or authorised unless you have invoices.',
    'UK electrical goods need a UK plug plus UKCA/CE proof.',
  ];
}

function keyOf(item: PolicyViolation): string {
  return `${item.policy}:${item.severity}:${item.evidence ?? item.reason}`.toLowerCase();
}

function unique(items: string[]): string[] {
  return Array.from(new Set(items.filter(Boolean)));
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Math.round(value)));
}

function clampNumber(value: unknown, min: number, max: number): number | null {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return null;
  return clamp(parsed, min, max);
}

function normalizeVerdict(value: unknown): PolicyVerdict {
  const raw = String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, '_');
  if (['do_not_list', 'dont_list', 'no', 'reject', 'ban', 'prohibited'].includes(raw)) return 'do_not_list';
  if (['review', 'caution', 'restricted', 'maybe'].includes(raw)) return 'review';
  return 'list';
}

function normalizeSeverity(value: unknown): PolicySeverity {
  const raw = String(value ?? '').trim().toLowerCase();
  if (raw === 'prohibited' || raw === 'banned') return 'prohibited';
  if (raw === 'restricted') return 'restricted';
  return 'risk';
}
