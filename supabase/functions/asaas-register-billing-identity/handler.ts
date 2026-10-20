import {
  BillingIdentityRegistrationError,
  type StoredBillingIdentityRegistration,
} from "../billing-identity-registration/index.ts";
import { BillingIdentityCryptoError } from "../billing-identity-crypto/index.ts";

export interface BillingIdentityHandlerDependencies {
  authenticate(accessToken: string): Promise<{ userId: string } | null>;
  register(userId: string, orderId: string, document: string): Promise<{
    outcome: "created" | "reused";
    identity: StoredBillingIdentityRegistration;
  }>;
}

const DEV_ALLOWED_ORIGINS = new Set([
  "http://localhost:8081",
  "http://localhost:19006",
]);

export function corsHeaders(request?: Request): Headers {
  const headers = new Headers({
    "access-control-allow-methods": "POST, OPTIONS",
    "access-control-allow-headers":
      "authorization, apikey, x-client-info, content-type",
  });
  const origin = request?.headers.get("origin");
  if (origin && DEV_ALLOWED_ORIGINS.has(origin)) {
    headers.set("access-control-allow-origin", origin);
    headers.set("vary", "Origin");
  }
  return headers;
}

function json(body: unknown, status: number, request?: Request): Response {
  const headers = corsHeaders(request);
  headers.set("content-type", "application/json; charset=utf-8");
  return new Response(JSON.stringify(body), { status, headers });
}

function token(request: Request): string | null {
  const header = request.headers.get("authorization");
  const match = header ? /^Bearer\s+([^\s]+)$/i.exec(header) : null;
  return match?.[1] ?? null;
}

function safeBody(
  body: unknown,
): body is { orderId: string; document: string } {
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return false;
  }
  const keys = Object.keys(body);
  if (
    keys.length !== 2 || !keys.includes("document") || !keys.includes("orderId")
  ) return false;
  return typeof (body as { document?: unknown }).document === "string" &&
    typeof (body as { orderId?: unknown }).orderId === "string";
}

async function readDocument(
  request: Request,
): Promise<{ orderId: string; document: string } | Response> {
  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().startsWith("application/json")) {
    return json({ ok: false, error: "INVALID_REQUEST" }, 400, request);
  }
  try {
    const body = await request.json();
    if (
      !safeBody(body) || body.document.trim() === "" ||
      body.orderId.trim() === ""
    ) {
      return json({ ok: false, error: "INVALID_REQUEST" }, 400, request);
    }
    return body;
  } catch {
    return json({ ok: false, error: "INVALID_REQUEST" }, 400, request);
  }
}

export async function handleRegisterBillingIdentityRequest(
  request: Request,
  dependencies: BillingIdentityHandlerDependencies,
): Promise<Response> {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders(request) });
  }
  if (request.method !== "POST") {
    return json({ ok: false, error: "METHOD_NOT_ALLOWED" }, 405, request);
  }
  const input = await readDocument(request);
  if (input instanceof Response) return input;
  const accessToken = token(request);
  if (!accessToken) {
    return json({ ok: false, error: "UNAUTHORIZED" }, 401, request);
  }
  const user = await dependencies.authenticate(accessToken).catch(() => null);
  if (!user?.userId) {
    return json({ ok: false, error: "UNAUTHORIZED" }, 401, request);
  }

  try {
    const result = await dependencies.register(
      user.userId,
      input.orderId,
      input.document,
    );
    return json(
      {
        ok: true,
        outcome: result.outcome,
        identityId: result.identity.id,
        identityVersion: result.identity.identityVersion,
        documentType: result.identity.documentType,
        documentLast4: result.identity.documentLast4,
        keyVersion: result.identity.keyVersion,
        status: result.identity.status,
      },
      200,
      request,
    );
  } catch (error) {
    if (error instanceof BillingIdentityCryptoError) {
      return json(
        {
          ok: false,
          error: error.code === "INVALID_DOCUMENT"
            ? "INVALID_DOCUMENT"
            : "INTERNAL_ERROR",
        },
        error.code === "INVALID_DOCUMENT" ? 400 : 500,
        request,
      );
    }
    if (error instanceof BillingIdentityRegistrationError) {
      return json(
        { ok: false, error: error.code },
        error.code === "IDENTITY_CONFLICT" ||
          error.code === "PAYMENT_NOT_REQUIRED"
          ? 409
          : 500,
        request,
      );
    }
    return json({ ok: false, error: "INTERNAL_ERROR" }, 500, request);
  }
}
