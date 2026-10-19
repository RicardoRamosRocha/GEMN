import { createClient } from 'npm:@supabase/supabase-js@2';

type JsonRecord = Record<string, unknown>;

const CORS_ALLOWED_HEADERS = 'authorization, apikey, x-client-info, content-type';
const CORS_ALLOWED_METHODS = 'POST, OPTIONS';

function corsHeaders(request: Request): HeadersInit {
  const headers: Record<string, string> = {
    'access-control-allow-headers': CORS_ALLOWED_HEADERS,
    'access-control-allow-methods': CORS_ALLOWED_METHODS,
    'cache-control': 'no-store',
  };
  const origin = request.headers.get('origin');
  if (origin) {
    try {
      const url = new URL(origin);
      if (url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname)
        && ['8081', '19000', '19001', '19006'].includes(url.port)) {
        headers['access-control-allow-origin'] = origin;
        headers.vary = 'Origin';
      }
    } catch {
      // Origin is simply not allowed.
    }
  }
  return headers;
}

function jsonResponse(body: JsonRecord, status: number, request: Request): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', ...corsHeaders(request) },
  });
}

function bearerToken(request: Request): string | null {
  const value = request.headers.get('authorization');
  const match = value?.match(/^Bearer\s+([^\s]+)$/i);
  return match?.[1] ?? null;
}

function isRequestBody(value: unknown): value is { orderId: string; idempotencyKey: string } {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const body = value as Record<string, unknown>;
  return typeof body.orderId === 'string' && body.orderId.trim() !== ''
    && typeof body.idempotencyKey === 'string' && body.idempotencyKey.trim() !== '';
}

async function authenticate(request: Request): Promise<{ userId: string } | Response> {
  const token = bearerToken(request);
  const url = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  if (!token || !url || !anonKey) return jsonResponse({ ok: false, error: 'UNAUTHORIZED' }, 401, request);

  const client = createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const { data, error } = await client.auth.getUser(token);
  if (error || !data.user) return jsonResponse({ ok: false, error: 'UNAUTHORIZED' }, 401, request);
  return { userId: data.user.id };
}

async function handleCreatePayment(request: Request): Promise<Response> {
  const authenticated = await authenticate(request);
  if (authenticated instanceof Response) return authenticated;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ ok: false, error: 'INVALID_REQUEST' }, 400, request);
  }
  if (!isRequestBody(body)) return jsonResponse({ ok: false, error: 'INVALID_REQUEST' }, 400, request);

  // The production pipeline is intentionally not enabled in E2 yet. Its order is:
  // authenticated user -> prepare RPC -> service-role claim -> customer lookup/create
  // -> Asaas POST -> finalize RPC, or reconciliation RPC after an uncertain result.
  // No service-role key, customer document, payment amount, or upstream error is returned.
  console.info('asaas-create-payment request accepted for authenticated order');
  void authenticated.userId;
  return jsonResponse({ ok: false, error: 'INTERNAL_ERROR' }, 501, request);
}

Deno.serve(async (request: Request) => {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders(request) });
  if (request.method !== 'POST') return jsonResponse({ ok: false, error: 'METHOD_NOT_ALLOWED' }, 405, request);
  try {
    return await handleCreatePayment(request);
  } catch {
    console.error('asaas-create-payment unexpected error');
    return jsonResponse({ ok: false, error: 'INTERNAL_ERROR' }, 500, request);
  }
});
