import { createClient } from 'npm:@supabase/supabase-js@2';

const ASAAS_SANDBOX_HOST = 'api-sandbox.asaas.com';
const REQUEST_TIMEOUT_MS = 8_000;
const CORS_ALLOWED_HEADERS = 'authorization, apikey, x-client-info, content-type';
const CORS_ALLOWED_METHODS = 'GET, OPTIONS';

type JsonRecord = Record<string, unknown>;

function isAllowedExpoWebOrigin(origin: string | null): boolean {
  if (!origin) return false;
  try {
    const url = new URL(origin);
    return url.protocol === 'http:'
      && (url.hostname === 'localhost' || url.hostname === '127.0.0.1')
      && ['8081', '19000', '19001', '19006'].includes(url.port);
  } catch {
    return false;
  }
}

function corsHeaders(request: Request): HeadersInit {
  const headers: Record<string, string> = {
    'access-control-allow-headers': CORS_ALLOWED_HEADERS,
    'access-control-allow-methods': CORS_ALLOWED_METHODS,
    'cache-control': 'no-store',
  };
  const origin = request.headers.get('origin');
  if (isAllowedExpoWebOrigin(origin)) {
    headers['access-control-allow-origin'] = origin!;
    headers.vary = 'Origin';
  }
  return headers;
}

function jsonResponse(body: JsonRecord, status: number, request: Request): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      ...corsHeaders(request),
    },
  });
}

function configuredSandboxBaseUrl(): URL {
  const rawBaseUrl = Deno.env.get('ASAAS_BASE_URL');
  if (!rawBaseUrl) {
    throw new Error('ASAAS_BASE_URL_MISSING');
  }

  let baseUrl: URL;
  try {
    baseUrl = new URL(rawBaseUrl);
  } catch {
    throw new Error('ASAAS_BASE_URL_INVALID');
  }

  if (baseUrl.protocol !== 'https:' || baseUrl.hostname !== ASAAS_SANDBOX_HOST) {
    throw new Error('ASAAS_SANDBOX_ONLY');
  }

  const normalizedPath = baseUrl.pathname.replace(/\/+$/, '');
  if (normalizedPath !== '/v3' || baseUrl.search || baseUrl.hash) {
    throw new Error('ASAAS_BASE_URL_INVALID');
  }

  return new URL(`${baseUrl.toString().replace(/\/+$/, '')}/`);
}

function bearerToken(request: Request): string | null {
  const authorization = request.headers.get('authorization');
  if (!authorization) return null;

  const match = authorization.match(/^Bearer\s+([^\s]+)$/i);
  return match?.[1] ?? null;
}

async function requireAdministrator(request: Request): Promise<Response | null> {
  const token = bearerToken(request);
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY');

  if (!token || !supabaseUrl || !supabaseAnonKey) {
    return jsonResponse({ ok: false, error: 'UNAUTHORIZED' }, 401, request);
  }

  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });

  const { data: userData, error: userError } = await supabase.auth.getUser(token);
  if (userError || !userData.user) {
    return jsonResponse({ ok: false, error: 'UNAUTHORIZED' }, 401, request);
  }

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('is_admin')
    .eq('id', userData.user.id)
    .maybeSingle();

  if (profileError) {
    console.error('asaas-health-check authorization lookup failed');
    return jsonResponse({ ok: false, error: 'AUTHORIZATION_UNAVAILABLE' }, 503, request);
  }

  if (profile?.is_admin !== true) {
    return jsonResponse({ ok: false, error: 'FORBIDDEN' }, 403, request);
  }

  return null;
}

async function checkAsaas(baseUrl: URL, request: Request): Promise<Response> {
  const accessToken = Deno.env.get('ASAAS_ACCESS_TOKEN');
  if (!accessToken) {
    return jsonResponse({ ok: false, error: 'ASAAS_ACCESS_TOKEN_MISSING' }, 500, request);
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(new URL('myAccount/status/', baseUrl), {
      method: 'GET',
      headers: {
        accept: 'application/json',
        'user-agent': 'GEMN/asaas-health-check',
        access_token: accessToken,
      },
      signal: controller.signal,
    });

    if (!response.ok) {
      console.error(`asaas-health-check upstream status ${response.status}`);
      return jsonResponse({
        ok: false,
        service: 'asaas',
        environment: 'sandbox',
        error: 'ASAAS_REQUEST_FAILED',
      }, 502, request);
    }

    return jsonResponse({
      ok: true,
      service: 'asaas',
      environment: 'sandbox',
      status: 'reachable',
      checkedAt: new Date().toISOString(),
    }, 200, request);
  } catch (error) {
    const errorCode = error instanceof DOMException && error.name === 'AbortError'
      ? 'ASAAS_TIMEOUT'
      : 'ASAAS_UNAVAILABLE';
    console.error(`asaas-health-check upstream error ${errorCode}`);
    return jsonResponse({ ok: false, service: 'asaas', environment: 'sandbox', error: errorCode }, 502, request);
  } finally {
    clearTimeout(timeoutId);
  }
}

Deno.serve(async (request) => {
  try {
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders(request) });
    }

    if (request.method !== 'GET') {
      return jsonResponse({ ok: false, error: 'METHOD_NOT_ALLOWED' }, 405, request);
    }

    const authorizationResponse = await requireAdministrator(request);
    if (authorizationResponse) return authorizationResponse;

    let baseUrl: URL;
    try {
      baseUrl = configuredSandboxBaseUrl();
    } catch (error) {
      const code = error instanceof Error ? error.message : 'ASAAS_CONFIGURATION_INVALID';
      console.error(`asaas-health-check configuration error ${code}`);
      return jsonResponse({ ok: false, error: code }, 500, request);
    }

    return checkAsaas(baseUrl, request);
  } catch {
    console.error('asaas-health-check unexpected error');
    return jsonResponse({ ok: false, error: 'INTERNAL_ERROR' }, 500, request);
  }
});
