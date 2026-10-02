import { EbayItemDetail } from '../integrations/ebay/ebay-rest.client';

export type SalesDataSource = 'observed' | 'listing-average';

export interface SalesVelocityRow {
  label: string;
  windowDays: number;
  units: number | null;
  revenue: number | null;
  source: SalesDataSource;
  note: string;
}

/** One reading of the listing's sold counter, as recorded by this app. */
export interface SalesObservationRow {
  capturedAt: string;
  soldCount: number;
  unitsSincePrevious: number | null;
  daysSincePrevious: number | null;
  price: number;
  available: number | null;
}

export interface SalesHistoryView {
  totalSold: number;
  currency: string;
  estimatedRevenue: number;
  listingAgeDays: number | null;
  availableQuantity: number | null;
  averageUnitsPerDay: number | null;
  velocity: SalesVelocityRow[];
  observations: SalesObservationRow[];
  purchaseHistoryUrl: string | null;
  /** Explains to the seller exactly where these numbers come from. */
  dataNote: string;
}

export type KeywordSource = 'competitors' | 'ebay-suggest' | 'ai';

export interface KeywordRow {
  phrase: string;
  words: number;
  listings: number | null;
  unitsSold: number | null;
  soldShare: number | null;
  inTitle: boolean;
  source: KeywordSource;
}

export interface KeywordInsightsView {
  seed: string;
  sampleListings: number;
  sampleUnitsSold: number;
  /** Phrases mined from the best selling competitor titles. */
  topPhrases: KeywordRow[];
  /** High-value phrases this listing's own title is missing. */
  missingFromTitle: KeywordRow[];
  /** Phrases eBay's own search box suggests for the seed term. */
  buyerSearches: string[];
  aiKeywords: string[];
  note: string;
}

export type AspectSource = 'listing' | 'ai' | 'missing';

export interface SeoAspectSuggestion {
  name: string;
  value: string | null;
  required: boolean;
  usedForSearch: boolean;
  source: AspectSource;
}

export interface SeoChecklistItem {
  label: string;
  status: 'pass' | 'warn' | 'fail';
  detail: string;
}

export interface SeoRecommendationView {
  categoryId: string | null;
  categoryName: string | null;
  recommendedTitle: string;
  titleLength: number;
  descriptionHtml: string;
  descriptionText: string;
  highlights: string[];
  aspects: SeoAspectSuggestion[];
  checklist: SeoChecklistItem[];
  aiGenerated: boolean;
  note: string;
}

export interface EbayItemInsightView {
  item: EbayItemDetail;
  marketplace: string;
  /** Pre-built query for the "search this item on AliExpress" button. */
  aliexpressQuery: string;
  sales: SalesHistoryView;
  keywords: KeywordInsightsView;
  seo: SeoRecommendationView;
}
