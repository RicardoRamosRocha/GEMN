import {
  AsaasCustomerProvisioningError,
  type ProvisionedAsaasCustomer,
} from "../asaas-customer-provisioning/index.ts";

export interface VerifiedUser {
  userId: string;
}

export interface ProvisionCustomerHandlerDependencies {
  authenticate(accessToken: string): Promise<VerifiedUser | null>;
  provision(userId: string): Promise<ProvisionedAsaasCustomer>;
}

function json(body: unknown, status: number, request?: Request): Response {
  const headers = new Headers({
    "content-type": "application/json; charset=utf-8",
  });
  const origin = request?.headers.get("origin");
  if (
    origin &&
    (origin === "http://localhost:8081" || origin === "http://localhost:19006")
  ) {
    headers.set("access-control-allow-origin", origin);
    headers.set("vary", "Origin");
  }
  return new Response(JSON.stringify(body), { status, headers });
}

function bearerToken(request: Request): string | null {
  const header = request.headers.get("authorization");
  if (!header) return null;
  const match = /^Bearer\s+([^\s]+)$/i.exec(header);
  return match?.[1] ?? null;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function validateBody(request: Request): Promise<
  | { ok: true }
  | { ok: false; response: Response }
> {
  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().startsWith("application/json")) {
    return { ok: true };
  }
  const raw = await request.text();
  if (!raw.trim()) return { ok: true };
  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return {
      ok: false,
      response: json({ ok: false, error: "INVALID_REQUEST" }, 400, request),
    };
  }
  if (!isObject(body) || Object.keys(body).some((key) => key !== "")) {
    return {
      ok: false,
      response: json({ ok: false, error: "INVALID_REQUEST" }, 400, request),
    };
  }
  return { ok: true };
}

function errorResponse(
  error: AsaasCustomerProvisioningError,
  request: Request,
): Response {
  const status = error.code === "IDENTITY_UNAVAILABLE"
    ? 404
    : error.code === "PROVISIONING_IN_PROGRESS" ||
        error.code === "PROVISIONING_NEEDS_REVIEW" ||
        error.code === "ASAAS_TIMEOUT"
    ? 409
    : error.code === "ASAAS_REJECTED"
    ? 502
    : error.code === "ASAAS_UNAVAILABLE"
    ? 503
    : 500;
  return json({ ok: false, error: error.code }, status, request);
}

export async function handleProvisionCustomerRequest(
  request: Request,
  dependencies: ProvisionCustomerHandlerDependencies,
): Promise<Response> {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204 });
  }
  if (request.method !== "POST") {
    return json({ ok: false, error: "METHOD_NOT_ALLOWED" }, 405, request);
  }
  const body = await validateBody(request);
  if (!body.ok) return body.response;

  const token = bearerToken(request);
  if (!token) return json({ ok: false, error: "UNAUTHORIZED" }, 401, request);
  const verifiedUser = await dependencies.authenticate(token).catch(() => null);
  if (!verifiedUser?.userId) {
    return json({ ok: false, error: "UNAUTHORIZED" }, 401, request);
  }

  try {
    return json(
      { ok: true, ...await dependencies.provision(verifiedUser.userId) },
      200,
      request,
    );
  } catch (error) {
    if (error instanceof AsaasCustomerProvisioningError) {
      return errorResponse(error, request);
    }
    return json({ ok: false, error: "INTERNAL_ERROR" }, 500, request);
  }
}
