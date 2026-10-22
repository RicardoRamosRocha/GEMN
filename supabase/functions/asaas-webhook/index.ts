import { createClient } from "npm:@supabase/supabase-js@2";
import {
  createAsaasWebhookHandler,
  type AsaasWebhookHandlerDependencies,
  type AsaasWebhookPersistenceInput,
  type AsaasWebhookPersistenceResult,
} from "./handler.ts";
import { createFinalizationDispatcher } from "../asaas-payment-finalizer/dispatch.ts";

const RPC_NAME = "ingest_asaas_webhook_event_v2";
const RPC_TIMEOUT_MS = 10_000;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PROCESSING_STATUSES = new Set(["pending", "accepted", "processed", "ignored", "needs_review", "failed"]);

type RpcError = { message: string };

export interface SupabaseRpcPort {
  rpc(name: string, args: Record<string, unknown>): Promise<{ data: unknown; error: RpcError | null }>;
}

export class WebhookPersistenceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WebhookPersistenceError";
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_PATTERN.test(value);
}

function requiredBoolean(row: Record<string, unknown>, field: string): boolean {
  const value = row[field];
  if (typeof value !== "boolean") throw new WebhookPersistenceError(`invalid RPC field: ${field}`);
  return value;
}

function requiredNullableUuid(row: Record<string, unknown>, field: string): string | null {
  const value = row[field];
  if (value === null) return null;
  if (!isUuid(value)) throw new WebhookPersistenceError(`invalid RPC field: ${field}`);
  return value;
}

export function validatePersistenceResult(data: unknown): AsaasWebhookPersistenceResult {
  if (!Array.isArray(data) || data.length !== 1 || !isRecord(data[0])) {
    throw new WebhookPersistenceError("unexpected RPC result cardinality");
  }
  const row = data[0];
  if (!isUuid(row.webhook_event_id)) throw new WebhookPersistenceError("invalid RPC field: webhook_event_id");
  if (typeof row.processing_status !== "string" || !PROCESSING_STATUSES.has(row.processing_status)) {
    throw new WebhookPersistenceError("invalid RPC field: processing_status");
  }
  if (row.reason_code !== null && typeof row.reason_code !== "string") {
    throw new WebhookPersistenceError("invalid RPC field: reason_code");
  }
  return {
    webhook_event_id: row.webhook_event_id,
    duplicate: requiredBoolean(row, "duplicate"),
    hash_conflict: requiredBoolean(row, "hash_conflict"),
    persisted: requiredBoolean(row, "persisted"),
    processing_status: row.processing_status,
    reason_code: row.reason_code,
    payment_intent_id: requiredNullableUuid(row, "payment_intent_id"),
  };
}

function withTimeout<T>(operation: Promise<T>, timeoutMs: number): Promise<T> {
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs <= 0) {
    return Promise.reject(new WebhookPersistenceError("invalid RPC timeout"));
  }
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new WebhookPersistenceError("Supabase RPC timeout")), timeoutMs);
  });
  return Promise.race([operation, timeout]).finally(() => {
    if (timer !== undefined) clearTimeout(timer);
  });
}

export function createAsaasWebhookPersistence(
  rpc: SupabaseRpcPort,
  timeoutMs = RPC_TIMEOUT_MS,
): (input: AsaasWebhookPersistenceInput) => Promise<AsaasWebhookPersistenceResult> {
  return async (input) => {
    const response = await withTimeout(rpc.rpc(RPC_NAME, {
      p_asaas_event_id: input.p_asaas_event_id,
      p_event_type: input.p_event_type,
      p_asaas_payment_id: input.p_asaas_payment_id,
      p_external_reference: input.p_external_reference,
      p_provider_status: input.p_provider_status,
      p_payment_value: input.p_payment_value,
      p_net_value: input.p_net_value,
      p_occurred_at: input.p_occurred_at,
      p_payload_hash: input.p_payload_hash,
      p_source_date_created: input.p_source_date_created,
    }), timeoutMs);
    if (response.error) throw new WebhookPersistenceError("Supabase RPC failed");
    return validatePersistenceResult(response.data);
  };
}

function requiredEnvironment(env: Pick<Deno.Env, "get">): { url: string; serviceRoleKey: string } {
  const url = env.get("SUPABASE_URL")?.trim();
  const serviceRoleKey = env.get("SUPABASE_SERVICE_ROLE_KEY")?.trim();
  if (!url || !serviceRoleKey || !env.get("ASAAS_WEBHOOK_AUTH_TOKEN")?.trim()) {
    throw new Error("webhook configuration unavailable");
  }
  return { url, serviceRoleKey };
}

export function createRuntimeHandler(env: Pick<Deno.Env, "get"> = Deno.env): (request: Request) => Promise<Response> {
  const { url, serviceRoleKey } = requiredEnvironment(env);
  const client = createClient(url, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const rpc: SupabaseRpcPort = {
    async rpc(name, args) {
      const response = await client.rpc(name, args);
      return { data: response.data, error: response.error ? { message: response.error.message } : null };
    },
  };
  const finalizerUrl = env.get("ASAAS_FINALIZER_URL")?.trim();
  const finalizerToken = env.get("ASAAS_FINALIZER_INTERNAL_TOKEN")?.trim();
  const dispatchFinalization = finalizerUrl && finalizerToken
    ? createFinalizationDispatcher({ url: finalizerUrl, internalToken: finalizerToken }).dispatch
    : undefined;
  const dependencies: AsaasWebhookHandlerDependencies = {
    persist: createAsaasWebhookPersistence(rpc),
    dispatchFinalization,
    env,
  };
  return createAsaasWebhookHandler(dependencies);
}

if (import.meta.main) {
  let handler: ((request: Request) => Promise<Response>) | null = null;
  Deno.serve(async (request) => {
    try {
      handler ??= createRuntimeHandler();
      return await handler(request);
    } catch {
      return new Response(JSON.stringify({ ok: false, error: "CONFIGURATION_INVALID" }), {
        status: 500,
        headers: { "cache-control": "no-store", "content-type": "application/json; charset=utf-8" },
      });
    }
  });
}
