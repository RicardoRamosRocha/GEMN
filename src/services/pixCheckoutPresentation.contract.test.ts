import { getPixCheckoutVisualState } from './pixCheckoutPresentation';

const assert = (condition: boolean, message: string) => {
  if (!condition) throw new Error(message);
};

assert(getPixCheckoutVisualState({ hasPayment: false, isGenerating: false, isChecking: false, hasRecoverableError: false }) === 'awaiting_generation', 'initial state');
assert(getPixCheckoutVisualState({ hasPayment: false, isGenerating: true, isChecking: false, hasRecoverableError: false }) === 'generating', 'generating state');
assert(getPixCheckoutVisualState({ hasPayment: true, isGenerating: false, isChecking: false, hasRecoverableError: false }) === 'awaiting_payment', 'waiting state');
assert(getPixCheckoutVisualState({ hasPayment: true, isGenerating: false, isChecking: true, hasRecoverableError: false }) === 'checking_payment', 'checking state');
assert(getPixCheckoutVisualState({ hasPayment: true, isGenerating: false, isChecking: false, hasRecoverableError: true }) === 'error', 'recoverable error state');
assert(getPixCheckoutVisualState({ orderStatus: 'confirmado', hasPayment: true, isGenerating: false, isChecking: false, hasRecoverableError: false }) === 'confirmed', 'confirmed state');
assert(getPixCheckoutVisualState({ orderStatus: 'cancelado', hasPayment: true, isGenerating: false, isChecking: false, hasRecoverableError: false }) === 'cancelled', 'cancelled state');
assert(getPixCheckoutVisualState({ orderStatus: 'expirado', hasPayment: true, isGenerating: false, isChecking: false, hasRecoverableError: false }) === 'expired', 'expired state');
