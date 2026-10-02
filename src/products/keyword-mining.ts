/**
 * Keyword mining for eBay product research.
 *
 * There is no public API for eBay search volume, so the signal used here is the
 * one thing eBay does expose: the titles of the best selling listings for a
 * term, together with how many units each of those listings has sold. A phrase
 * that appears in the titles of listings responsible for a large share of the
 * units sold is a phrase worth having in your own title.
 */

/** Words that carry no search intent on their own. */
const STOPWORDS = new Set([
  'a',
  'an',
  'and',
  'are',
  'as',
  'at',
  'be',
  'but',
  'by',
  'for',
  'from',
  'had',
  'has',
  'have',
  'in',
  'into',
  'is',
  'it',
  'its',
  'of',
  'on',
  'or',
  'our',
  'per',
  'so',
  'than',
  'that',
  'the',
  'their',
  'then',
  'there',
  'these',
  'they',
  'this',
  'to',
  'up',
  'was',
  'were',
  'will',
  'with',
  'you',
  'your',
]);

const MAX_PHRASE_WORDS = 3;

export interface MiningInput {
  title: string;
  soldCount: number;
}

export interface MinedPhrase {
  phrase: string;
  words: number;
  /** How many of the sampled listings use this phrase in their title. */
  listings: number;
  /** Units sold by the listings that use it. */
  unitsSold: number;
}

export interface MiningResult {
  phrases: MinedPhrase[];
  sampleListings: number;
  sampleUnitsSold: number;
}

export function normaliseTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/&amp;/g, '&')
    .replace(/[^a-z0-9+&.'\s-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function tokenise(title: string): string[] {
  return normaliseTitle(title)
    .split(' ')
    .map((word) => word.replace(/^[-.']+|[-.']+$/g, ''))
    .filter((word) => word.length > 1 || /^[0-9]$/.test(word));
}

/**
 * A search seed for the product: the leading meaningful words of the title,
 * which is what a buyer would realistically type.
 */
export function searchSeed(title: string, maxWords = 5): string {
  const words = tokenise(title).filter((word) => !STOPWORDS.has(word));
  return words.slice(0, maxWords).join(' ');
}

/** Every 1-to-3 word phrase in a title that neither starts nor ends on a stopword. */
export function phrasesInTitle(title: string): string[] {
  const words = tokenise(title);
  const phrases = new Set<string>();
  for (let start = 0; start < words.length; start += 1) {
    if (STOPWORDS.has(words[start])) continue;
    for (let size = 1; size <= MAX_PHRASE_WORDS && start + size <= words.length; size += 1) {
      const slice = words.slice(start, start + size);
      if (STOPWORDS.has(slice[slice.length - 1])) continue;
      phrases.add(slice.join(' '));
    }
  }
  return [...phrases];
}

export function minePhrases(
  listings: MiningInput[],
  options: { minListings?: number; limit?: number } = {},
): MiningResult {
  const minListings = options.minListings ?? 2;
  const limit = options.limit ?? 40;
  const counts = new Map<string, { listings: number; unitsSold: number }>();
  let sampleUnitsSold = 0;

  for (const listing of listings) {
    const units = Math.max(0, listing.soldCount);
    sampleUnitsSold += units;
    for (const phrase of phrasesInTitle(listing.title)) {
      const current = counts.get(phrase) ?? { listings: 0, unitsSold: 0 };
      current.listings += 1;
      current.unitsSold += units;
      counts.set(phrase, current);
    }
  }

  const phrases: MinedPhrase[] = [...counts.entries()]
    .map(([phrase, stats]) => ({
      phrase,
      words: phrase.split(' ').length,
      listings: stats.listings,
      unitsSold: stats.unitsSold,
    }))
    .filter((entry) => entry.listings >= minListings);

  return {
    phrases: rankPhrases(dropSubsumedPhrases(phrases)).slice(0, limit),
    sampleListings: listings.length,
    sampleUnitsSold,
  };
}

/**
 * Removes a short phrase when a longer phrase containing it appears in exactly
 * the same listings, because the longer phrase is the more specific keyword and
 * the short one adds no information.
 */
function dropSubsumedPhrases(phrases: MinedPhrase[]): MinedPhrase[] {
  const byLength = [...phrases].sort((a, b) => b.words - a.words);
  const kept: MinedPhrase[] = [];

  for (const candidate of byLength) {
    const subsumed = kept.some(
      (longer) =>
        longer.words > candidate.words &&
        longer.listings === candidate.listings &&
        longer.phrase.includes(candidate.phrase),
    );
    if (!subsumed) kept.push(candidate);
  }
  return kept;
}

function rankPhrases(phrases: MinedPhrase[]): MinedPhrase[] {
  return [...phrases].sort(
    (a, b) => b.unitsSold - a.unitsSold || b.listings - a.listings || b.words - a.words,
  );
}

/** True when the title already contains the phrase as whole words. */
export function titleContainsPhrase(title: string, phrase: string): boolean {
  return ` ${tokenise(title).join(' ')} `.includes(` ${phrase} `);
}
