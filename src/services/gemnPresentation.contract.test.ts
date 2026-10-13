import { getGemnPresentationEligibility } from './gemnPresentation';

const enabled = getGemnPresentationEligibility({ sellerAcceptsGemn: true, listingAcceptsGemn: true, gemnValue: '30.00' });
if (!enabled.enabled || enabled.value !== 30) throw new Error('eligible GEMN presentation failed');

const sellerDisabled = getGemnPresentationEligibility({ sellerAcceptsGemn: false, listingAcceptsGemn: true, gemnValue: 30 });
if (sellerDisabled.enabled) throw new Error('seller-level GEMN opt-out was ignored');

const listingDisabled = getGemnPresentationEligibility({ sellerAcceptsGemn: true, listingAcceptsGemn: false, gemnValue: 30 });
if (listingDisabled.enabled) throw new Error('listing-level GEMN opt-out was ignored');

const missingValue = getGemnPresentationEligibility({ sellerAcceptsGemn: true, listingAcceptsGemn: true, gemnValue: null });
if (missingValue.enabled) throw new Error('missing GEMN value was accepted');

const invalidValue = getGemnPresentationEligibility({ sellerAcceptsGemn: true, listingAcceptsGemn: true, gemnValue: 'not-a-number' });
if (invalidValue.enabled) throw new Error('invalid GEMN value was accepted');

const negativeValue = getGemnPresentationEligibility({ sellerAcceptsGemn: true, listingAcceptsGemn: true, gemnValue: -1 });
if (negativeValue.enabled) throw new Error('negative GEMN value was accepted');
