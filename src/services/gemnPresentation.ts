export type GemnPresentationInput = {
  sellerAcceptsGemn: boolean | null | undefined;
  listingAcceptsGemn: boolean | null | undefined;
  gemnValue: number | string | null | undefined;
};

export type GemnPresentationEligibility = {
  enabled: boolean;
  value?: number;
};

function validGemnValue(value: GemnPresentationInput['gemnValue']): number | null {
  if (typeof value === 'number') return Number.isFinite(value) && value >= 0 ? value : null;
  if (typeof value !== 'string' || value.trim() === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

export function getGemnPresentationEligibility(input: GemnPresentationInput): GemnPresentationEligibility {
  const value = validGemnValue(input.gemnValue);
  if (input.sellerAcceptsGemn !== true || input.listingAcceptsGemn !== true || value === null) {
    return { enabled: false };
  }
  return { enabled: true, value };
}

export const __gemnPresentationTestables = { validGemnValue };
