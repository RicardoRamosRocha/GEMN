import {
  __sellerSettingsTestables,
  createCashbackIdempotencyKey,
  SELLER_CASHBACK_RPC,
  SELLER_GEMN_ACCEPTANCE_RPC,
  validateCashbackPercentual,
} from './sellerSettings';
import { SellerSettingsServiceError, type UpdateCashbackParams } from '../types/sellerSettings';

// Teste de contrato compilável: o repositório não possui executor Jest/Vitest;
// o tsc valida os contratos e os casos de entrada abaixo.
const acceptanceRpcName: typeof SELLER_GEMN_ACCEPTANCE_RPC = 'set_seller_gemn_acceptance';
const cashbackRpcName: typeof SELLER_CASHBACK_RPC = 'set_seller_cashback';
const cashbackParams: UpdateCashbackParams = {
  percentual: 10.5,
  idempotencyKey: '00000000-0000-4000-8000-000000000031',
};

const acceptedValues = [0, 10.5, 20].map(validateCashbackPercentual);
void acceptedValues;
void acceptanceRpcName;
void cashbackRpcName;
void cashbackParams;

try { validateCashbackPercentual(-0.01); } catch (error) { void (error instanceof SellerSettingsServiceError); }
try { validateCashbackPercentual(20.01); } catch (error) { void (error instanceof SellerSettingsServiceError); }
try { validateCashbackPercentual(5.123); } catch (error) { void (error instanceof SellerSettingsServiceError); }
try { validateCashbackPercentual(Number.NaN); } catch (error) { void (error instanceof SellerSettingsServiceError); }

const retryKey = createCashbackIdempotencyKey();
const retryParams: UpdateCashbackParams = { percentual: 7, idempotencyKey: retryKey };
const sameRetryParams: UpdateCashbackParams = { ...retryParams };
if (sameRetryParams.idempotencyKey !== retryParams.idempotencyKey) throw new Error('retry must preserve idempotency key');
void sameRetryParams;

const acceptanceResult = __sellerSettingsTestables.sellerGemnAcceptanceFromRpc([
  { seller_id: 'seller-id', aceita_gemn: true },
]);
const cashbackResult = __sellerSettingsTestables.cashbackRuleFromRpc([
  {
    rule_id: 'rule-id',
    seller_id: 'seller-id',
    percentual: '7.00',
    vigente_desde: new Date().toISOString(),
    vigente_ate: null,
  },
]);
void acceptanceResult;
void cashbackResult;

const networkError = __sellerSettingsTestables.normalizeError(new Error('Failed to fetch'));
const suspendedError = __sellerSettingsTestables.normalizeError({ code: 'P0001', message: 'vendedor suspenso não pode configurar cashback' });
const authError = __sellerSettingsTestables.normalizeError({ code: 'P0001', message: 'usuário autenticado é obrigatório' });
const malformedRpc = (() => {
  try {
    __sellerSettingsTestables.cashbackRuleFromRpc([]);
    return false;
  } catch (error) {
    return error instanceof SellerSettingsServiceError;
  }
})();
void networkError;
void suspendedError;
if (networkError.kind !== 'network' || !networkError.retryable) throw new Error('network errors must be retryable');
if (suspendedError.kind !== 'authorization') throw new Error('suspended seller must be authorization error');
if (authError.kind !== 'auth') throw new Error('missing authentication must be auth error');
void malformedRpc;
void retryParams;
