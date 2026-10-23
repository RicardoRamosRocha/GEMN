import type { OrderStatus } from '../types/orders';

export type PixCheckoutVisualState =
  | 'awaiting_generation'
  | 'generating'
  | 'awaiting_payment'
  | 'checking_payment'
  | 'confirmed'
  | 'error'
  | 'cancelled'
  | 'expired';

export function getPixCheckoutVisualState(params: {
  orderStatus?: OrderStatus;
  hasPayment: boolean;
  isGenerating: boolean;
  isChecking: boolean;
  hasRecoverableError: boolean;
}): PixCheckoutVisualState {
  if (params.orderStatus === 'confirmado' || params.orderStatus === 'concluido') return 'confirmed';
  if (params.orderStatus === 'cancelado') return 'cancelled';
  if (params.orderStatus === 'expirado') return 'expired';
  if (params.isGenerating) return 'generating';
  if (params.isChecking && params.hasPayment) return 'checking_payment';
  if (params.hasRecoverableError) return 'error';
  if (params.hasPayment) return 'awaiting_payment';
  return 'awaiting_generation';
}
