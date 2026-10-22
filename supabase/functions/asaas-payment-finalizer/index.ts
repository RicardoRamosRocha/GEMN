import { createClient } from "npm:@supabase/supabase-js@2";

const ASAAS_STATUS_CONFIRMED = new Set(["RECEIVED", "CONFIRMED"]);
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export interface VerifiedAsaasPayment {
  id: string;
  status: string;
  value: number;
  currency: string;
  externalReference: string;
  customer: string;
  billingType: string;
}

export interface AsaasPaymentVerifier {
  verify(paymentId: string): Promise<VerifiedAsaasPayment>;
}

export interface FinalizerRpcPort {
  rpc(name: string, args: Record<string, unknown>): Promise<{ data: unknown; error: unknown }>;
}

export class AsaasPaymentFinalizerError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AsaasPaymentFinalizerError";
  }
}

function text(value: unknown, field: string): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new AsaasPaymentFinalizerError(`invalid ${field}`);
  }
  return value.trim();
}

function amount(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    throw new AsaasPaymentFinalizerError("invalid payment value");
  }
  return value;
}

function paymentRow(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new AsaasPaymentFinalizerError("invalid Asaas payment response");
  }
  return value as Record<string, unknown>;
}

export function mapVerifiedPayment(value: unknown): VerifiedAsaasPayment {
  const row = paymentRow(value);
  const status = text(row.status, "status").toUpperCase();
  const currency = text(row.currency, "currency").toUpperCase();
  const billingType = text(row.billingType, "billingType").toUpperCase();
  if (!ASAAS_STATUS_CONFIRMED.has(status)) {
    throw new AsaasPaymentFinalizerError("payment is not confirmed by Asaas");
  }
  if (currency !== "BRL" || billingType !== "PIX") {
    throw new AsaasPaymentFinalizerError("payment currency or method is invalid");
  }
  return {
    id: text(row.id, "id"),
    status,
    value: amount(row.value),
    currency,
    externalReference: text(row.externalReference, "externalReference"),
    customer: text(row.customer, "customer"),
    billingType,
  };
}

export function createAsaasPaymentVerifier(options: {
  apiKey: string;
  baseUrl: string;
  fetchImpl?: typeof fetch;
}): AsaasPaymentVerifier {
  const fetchImpl = options.fetchImpl ?? fetch;
  return {
    async verify(paymentId: string): Promise<VerifiedAsaasPayment> {
      const normalized = text(paymentId, "payment id");
      const response = await fetchImpl(
        `${options.baseUrl.replace(/\/$/u, "")}/payments/${encodeURIComponent(normalized)}`,
        { headers: { access_token: options.apiKey, accept: "application/json" } },
      );
      if (!response.ok) throw new AsaasPaymentFinalizerError("Asaas verification failed");
      return mapVerifiedPayment(await response.json());
    },
  };
}

function rpcRow(data: unknown): Record<string, unknown> {
  if (!Array.isArray(data) || data.length !== 1) {
    throw new AsaasPaymentFinalizerError("invalid finalization RPC response");
  }
  return paymentRow(data[0]);
}

async function finalizeVerifiedPayment(
  rpc: FinalizerRpcPort,
  paymentIntentId: string,
  payment: VerifiedAsaasPayment,
  providerCustomerId: string,
  idempotencyKey: string,
): Promise<Record<string, unknown>> {
  const result = await rpc.rpc("finalize_asaas_payment", {
    p_payment_intent_id: paymentIntentId,
    p_asaas_payment_id: payment.id,
    p_provider_status: payment.status,
    p_amount_due_real: payment.value,
    p_currency: payment.currency,
    p_external_reference: payment.externalReference,
    p_provider_customer_id: providerCustomerId,
    p_idempotency_key: idempotencyKey,
    p_verified_at: new Date().toISOString(),
  });
  if (result.error) throw new AsaasPaymentFinalizerError("financial finalization failed");
  return rpcRow(result.data);
}

export function createFinalizerHandler(options: {
  rpc: FinalizerRpcPort;
  verifier: AsaasPaymentVerifier;
  getStoredIntent: (paymentIntentId: string) => Promise<{
    asaasPaymentId: string;
    providerCustomerId: string;
  }>;
  internalToken: string;
}): (request: Request) => Promise<Response> {
  return async (request) => {
    if (request.method !== "POST") return new Response(null, { status: 405 });
    if (request.headers.get("x-gemn-internal-token") !== options.internalToken) {
      return new Response(null, { status: 401 });
    }
    try {
      const body = await request.json() as Record<string, unknown>;
      const paymentIntentId = text(body.payment_intent_id, "payment_intent_id");
      const idempotencyKey = text(body.idempotency_key, "idempotency_key");
      if (!UUID_PATTERN.test(paymentIntentId) || !UUID_PATTERN.test(idempotencyKey)) {
        throw new AsaasPaymentFinalizerError("invalid identifier");
      }
      const stored = await options.getStoredIntent(paymentIntentId);
      const payment = await options.verifier.verify(stored.asaasPaymentId);
      if (payment.customer !== stored.providerCustomerId) {
        throw new AsaasPaymentFinalizerError("provider customer mismatch");
      }
      const result = await finalizeVerifiedPayment(
        options.rpc,
        paymentIntentId,
        payment,
        stored.providerCustomerId,
        idempotencyKey,
      );
      return Response.json({ ok: true, result }, { status: 200, headers: { "cache-control": "no-store" } });
    } catch (error) {
      const status = error instanceof AsaasPaymentFinalizerError ? 422 : 503;
      return Response.json({ ok: false, error: status === 422 ? "PAYMENT_NOT_FINALIZABLE" : "FINALIZATION_UNAVAILABLE" }, { status });
    }
  };
}

if (import.meta.main) {
  const url = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const apiKey = Deno.env.get("ASAAS_API_KEY");
  const internalToken = Deno.env.get("ASAAS_FINALIZER_INTERNAL_TOKEN");
  const baseUrl = Deno.env.get("ASAAS_BASE_URL") ?? "https://api-sandbox.asaas.com/v3";
  if (!url || !serviceRoleKey || !apiKey || !internalToken) {
    throw new Error("finalizer configuration unavailable");
  }
  const admin = createClient(url, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const handler = createFinalizerHandler({
    internalToken,
    verifier: createAsaasPaymentVerifier({ apiKey, baseUrl }),
    getStoredIntent: async (paymentIntentId) => {
      const result = await admin.from("payment_intents")
        .select("asaas_payment_id, provider_customer_id")
        .eq("id", paymentIntentId)
        .single();
      if (result.error || !result.data) throw new AsaasPaymentFinalizerError("payment intent not found");
      const row = paymentRow(result.data);
      return { asaasPaymentId: text(row.asaas_payment_id, "asaas_payment_id"), providerCustomerId: text(row.provider_customer_id, "provider_customer_id") };
    },
    rpc: { rpc: async (name, args) => await admin.rpc(name, args) },
  });
  Deno.serve({ hostname: "127.0.0.1", port: 18001 }, handler);
}
