import { __billingIdentityTestables } from './billingIdentity';
import { FunctionsFetchError, FunctionsRelayError } from '@supabase/supabase-js';

const { safeErrorCode, safeErrorMessage, transportErrorCode } = __billingIdentityTestables;

if (safeErrorCode('INVALID_DOCUMENT') !== 'INVALID_DOCUMENT') {
  throw new Error('known billing identity error code was rejected');
}
if (safeErrorCode('server stack trace') !== 'EDGE_FUNCTION_FAILED') {
  throw new Error('arbitrary server error code was exposed');
}
if (safeErrorMessage('UNAUTHORIZED') !== 'A sessão expirou. Entre novamente para repetir o teste.') {
  throw new Error('authentication error message is not sanitized');
}
if (safeErrorMessage('UNKNOWN') !== 'Não foi possível concluir o cadastro de homologação.') {
  throw new Error('unknown error message is not sanitized');
}
if (transportErrorCode(new FunctionsFetchError({})) !== 'TRANSPORT_NETWORK') {
  throw new Error('fetch transport errors were not classified');
}
if (transportErrorCode(new FunctionsRelayError({})) !== 'TRANSPORT_RELAY') {
  throw new Error('relay transport errors were not classified');
}
