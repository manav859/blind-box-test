import { BlindBox, BlindBoxPoolItem } from './types';
import { ValidationError } from '../../lib/errors';

export interface SelectionDependencies {
  random: () => number;
}

export interface SelectionCandidateResult {
  eligibleItems: BlindBoxPoolItem[];
}

export function getEligiblePoolItems(poolItems: BlindBoxPoolItem[]): BlindBoxPoolItem[] {
  return poolItems.filter((poolItem) => poolItem.enabled && poolItem.inventoryQuantity > 0);
}

export function evaluateEligiblePoolItems(poolItems: BlindBoxPoolItem[]): SelectionCandidateResult {
  return {
    eligibleItems: getEligiblePoolItems(poolItems),
  };
}

function selectUniformItem(
  eligibleItems: BlindBoxPoolItem[],
  dependencies: SelectionDependencies,
): BlindBoxPoolItem {
  if (!eligibleItems.length) {
    throw new ValidationError('No eligible items available for uniform selection');
  }

  const index = Math.floor(dependencies.random() * eligibleItems.length);
  return eligibleItems[Math.min(index, eligibleItems.length - 1)];
}

function selectWeightedItem(
  eligibleItems: BlindBoxPoolItem[],
  dependencies: SelectionDependencies,
): BlindBoxPoolItem {
  if (!eligibleItems.length) {
    throw new ValidationError('No eligible items available for weighted selection');
  }

  for (const item of eligibleItems) {
    if (!Number.isFinite(item.weight) || item.weight <= 0) {
      throw new ValidationError('Weighted selection requires every eligible item to have a positive weight');
    }
  }

  const totalWeight = eligibleItems.reduce((sum, item) => sum + item.weight, 0);
  if (totalWeight <= 0) {
    throw new ValidationError('Weighted selection requires a positive total weight');
  }

  let threshold = dependencies.random() * totalWeight;
  for (const item of eligibleItems) {
    threshold -= item.weight;
    if (threshold < 0) {
      return item;
    }
  }

  return eligibleItems[eligibleItems.length - 1];
}

export function selectPoolItemForBlindBox(
  blindBox: BlindBox,
  poolItems: BlindBoxPoolItem[],
  dependencies: SelectionDependencies = {
    random: Math.random,
  },
): BlindBoxPoolItem {
  const { eligibleItems } = evaluateEligiblePoolItems(poolItems);

  if (!eligibleItems.length) {
    throw new ValidationError('No eligible items are available for this blind box');
  }

  switch (blindBox.selectionStrategy) {
    case 'uniform':
      return selectUniformItem(eligibleItems, dependencies);
    case 'weighted':
      return selectWeightedItem(eligibleItems, dependencies);
    default:
      throw new ValidationError(`Unsupported selection strategy: ${blindBox.selectionStrategy}`);
  }
}
