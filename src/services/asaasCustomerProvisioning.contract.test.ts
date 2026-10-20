import { FunctionsFetchError, FunctionsRelayError } from '@supabase/supabase-js';

import { __asaasCustomerProvisioningTestables } from './asaasCustomerProvisioning';

const { safeErrorCode, safeErrorMessage, transportErrorCode } = __asaasCustomerProvisioningTestables;

if (safeErrorCode('IDENTITY_UNAVAILABLE') !== 'IDENTITY_UNAVAILABLE') {
  throw new Error('known provisioning error code was rejected');
}
if (safeErrorCode('raw provider response') !== 'INTERNAL_ERROR') {
  throw new Error('arbitrary provisioning error code was exposed');
}
if (!safeErrorMessage('ASAAS_TIMEOUT').includes('Não tente novamente agora')) {
  throw new Error('ambiguous provider result was not classified safely');
}
if (transportErrorCode(new FunctionsFetchError({})) !== 'TRANSPORT_NETWORK') {
  throw new Error('fetch transport errors were not classified');
}
if (transportErrorCode(new FunctionsRelayError({})) !== 'TRANSPORT_RELAY') {
  throw new Error('relay transport errors were not classified');
}
