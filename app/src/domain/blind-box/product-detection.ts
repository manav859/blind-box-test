const SUPPORTED_BLIND_BOX_PRODUCT_TAGS = new Set(['blind-box', 'blind-box-active']);
const BLIND_BOX_COLLECTION_TAG_PREFIX = 'blind-box-collection:';
const BLIND_BOX_WEIGHT_TAG_PREFIX = 'blind-box-weight:';

interface BlindBoxProductLike {
  tags?: string[] | string | null;
  raw?: unknown;
}

export interface BlindBoxProductDetectionResult {
  isBlindBox: boolean;
  method: 'tag' | 'none';
  matchedValue: string | null;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }

  return value as Record<string, unknown>;
}

function normalizeProductTags(tags: unknown): string[] {
  if (Array.isArray(tags)) {
    return tags
      .map((tag) => (typeof tag === 'string' ? tag.trim().toLowerCase() : ''))
      .filter((tag) => Boolean(tag));
  }

  if (typeof tags !== 'string') {
    return [];
  }

  return tags
    .split(',')
    .map((tag) => tag.trim().toLowerCase())
    .filter((tag) => Boolean(tag));
}

export function getBlindBoxProductTags(product: BlindBoxProductLike | null | undefined): string[] {
  if (!product) {
    return [];
  }

  const directTags = normalizeProductTags(product.tags);
  if (directTags.length > 0) {
    return directTags;
  }

  return normalizeProductTags(asRecord(product.raw)?.tags);
}

export function parseBlindBoxCollectionTag(tags: string[]): string | null {
  const normalizedTags = normalizeProductTags(tags);
  const collectionTag = normalizedTags.find((tag) => tag.startsWith(BLIND_BOX_COLLECTION_TAG_PREFIX));
  if (!collectionTag) {
    return null;
  }

  const collectionHandle = collectionTag.slice(BLIND_BOX_COLLECTION_TAG_PREFIX.length).trim();
  return collectionHandle || null;
}

export function hasBlindBoxCollectionTag(tags: string[]): boolean {
  return normalizeProductTags(tags).some((tag) => tag.startsWith(BLIND_BOX_COLLECTION_TAG_PREFIX));
}

export function detectBlindBoxProduct(
  product: BlindBoxProductLike | null | undefined,
): BlindBoxProductDetectionResult {
  const matchedTag = getBlindBoxProductTags(product).find((tag) => SUPPORTED_BLIND_BOX_PRODUCT_TAGS.has(tag));

  if (matchedTag) {
    return {
      isBlindBox: true,
      method: 'tag',
      matchedValue: matchedTag,
    };
  }

  return {
    isBlindBox: false,
    method: 'none',
    matchedValue: null,
  };
}

export function isBlindBoxProduct(product: BlindBoxProductLike | null | undefined): boolean {
  return detectBlindBoxProduct(product).isBlindBox;
}

export function parseBlindBoxWeightTag(tags: string[]): number {
  const normalizedTags = normalizeProductTags(tags);
  const weightTag = normalizedTags.find((tag) => tag.startsWith(BLIND_BOX_WEIGHT_TAG_PREFIX));
  if (!weightTag) return 1;

  const weightStr = weightTag.slice(BLIND_BOX_WEIGHT_TAG_PREFIX.length).trim();
  const weight = Number(weightStr);
  if (!Number.isFinite(weight) || weight <= 0) return 1;

  return weight;
}
