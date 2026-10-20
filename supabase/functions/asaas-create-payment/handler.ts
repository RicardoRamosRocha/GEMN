import { PixOrchestrationError } from "../asaas-orchestrator/index.ts";

export interface CreatePaymentResponse {
  paymentIntent: unknown;
  customer: unknown;
  payment: unknown;
  qrCode: unknown;
}

export interface CreatePaymentHandlerDependencies {
  create(input: {
    token: string;
    orderId: string;
    idempotencyKey: string;
  }): Promise<CreatePaymentResponse>;
}

const DEV_ALLOWED_ORIGINS = new Set([
  "http://localhost:8081",
  "http://localhost:19006",
]);

function corsHeaders(request: Request): Headers {
  const headers = new Headers({
    "access-control-allow-methods": "POST, OPTIONS",
    "access-control-allow-headers":
      "authorization, apikey, x-client-info, content-type",
    "cache-control": "no-store",
  });
  const origin = request.headers.get("origin");
  if (origin && DEV_ALLOWED_ORIGINS.has(origin)) {
    headers.set("access-control-allow-origin", origin);
    headers.set("vary", "Origin");
  }
  return headers;
}

function json(body: Record<string, unknown>, status: number, request: Request): Response {
  const headers = corsHeaders(request);
  headers.set("content-type", "application/json; charset=utf-8");
  return new Response(JSON.stringify(body), { status, headers });
}

function bearerToken(request: Request): string | null {
  const value = request.headers.get("authorization");
  const match = value?.match(/^Bearer\s+([^\s]+)$/i);
  return match?.[1] ?? null;
}

function requestBody(value: unknown): value is { orderId: string; idempotencyKey: string } {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const body = value as Record<string, unknown>;
  return typeof body.orderId === "string" && body.orderId.trim() !== ""
    && typeof body.idempotencyKey === "string" && body.idempotencyKey.trim() !== "";
}

function statusFor(error: PixOrchestrationError): number {
  switch (error.code) {
    case "UNAUTHORIZED": return 401;
    case "INVALID_REQUEST":
    case "ORDER_NOT_ELIGIBLE": return 400;
    case "PAYMENT_ALREADY_IN_PROGRESS":
    case "PAYMENT_NEEDS_RECONCILIATION":
    case "PAYMENT_ALREADY_CREATED": return 409;
    case "ASAAS_REJECTED": return 502;
    case "ASAAS_UNAVAILABLE": return 503;
    case "ASAAS_TIMEOUT": return 409;
    default: return 500;
  }
}

export async function handleCreatePaymentRequest(
  request: Request,
  dependencies: CreatePaymentHandlerDependencies,
): Promise<Response> {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders(request) });
  }
  if (request.method !== "POST") {
    return json({ ok: false, error: "METHOD_NOT_ALLOWED" }, 405, request);
  }

  const token = bearerToken(request);
  if (!token) return json({ ok: false, error: "UNAUTHORIZED" }, 401, request);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json({ ok: false, error: "INVALID_REQUEST" }, 400, request);
  }
  if (!requestBody(body)) {
    return json({ ok: false, error: "INVALID_REQUEST" }, 400, request);
  }

  try {
    return json({
      ok: true,
      ...(await dependencies.create({
        token,
        orderId: body.orderId.trim(),
        idempotencyKey: body.idempotencyKey.trim(),
      })),
    }, 200, request);
  } catch (error) {
    if (error instanceof PixOrchestrationError) {
      return json({ ok: false, error: error.code }, statusFor(error), request);
    }
    return json({ ok: false, error: "INTERNAL_ERROR" }, 500, request);
  }
}

export { corsHeaders };
