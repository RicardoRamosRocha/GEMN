import { createClient } from "npm:@supabase/supabase-js@2";
import { createAsaasClientFromEnv } from "../asaas-client/index.ts";
import {
  createAsaasCustomerProvisioner,
} from "../asaas-customer-provisioning/index.ts";
import {
  createSupabaseCustomerProvisioningAdapter,
} from "../asaas-customer-provisioning-adapter/index.ts";
import { handleProvisionCustomerRequest } from "./handler.ts";

const REQUIRED_ENV = [
  "SUPABASE_URL",
  "SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "ASAAS_BASE_URL",
  "ASAAS_ACCESS_TOKEN",
  "GEMN_BILLING_ACTIVE_KEY_VERSION",
] as const;

function configurationError(): Error {
  return new Error("Provisioning configuration is unavailable");
}

function requireConfiguration(env: Pick<Deno.Env, "get">): number {
  for (const name of REQUIRED_ENV) {
    if (!env.get(name)?.trim()) throw configurationError();
  }
  const rawVersion = env.get("GEMN_BILLING_ACTIVE_KEY_VERSION");
  if (!rawVersion || !/^[1-9][0-9]{0,8}$/.test(rawVersion)) {
    throw configurationError();
  }
  const version = Number(rawVersion);
  if (!Number.isSafeInteger(version) || version < 1) throw configurationError();
  if (
    !env.get(`GEMN_BILLING_ENCRYPTION_KEY_V${version}`)?.trim() ||
    !env.get(`GEMN_BILLING_HMAC_KEY_V${version}`)?.trim()
  ) {
    throw configurationError();
  }
  return version;
}

function createHandler(env: Pick<Deno.Env, "get"> = Deno.env) {
  requireConfiguration(env);
  const url = env.get("SUPABASE_URL")!;
  const anonKey = env.get("SUPABASE_ANON_KEY")!;
  const serviceRoleKey = env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const adminClient = createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const db = createSupabaseCustomerProvisioningAdapter({ adminClient });
  const asaas = createAsaasClientFromEnv(env);
  const provisioner = createAsaasCustomerProvisioner({
    db,
    asaas,
    cryptoEnv: env,
  });
  const buyerClientFactory = (token: string) =>
    createClient(url, anonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { Authorization: `Bearer ${token}` } },
    });
  const dependencies = {
    async authenticate(token: string) {
      const { data, error } = await buyerClientFactory(token).auth.getUser(
        token,
      );
      if (error || !data.user?.id) return null;
      return { userId: data.user.id };
    },
    async provision(userId: string) {
      return await provisioner.provision(userId);
    },
  };
  return (request: Request) =>
    handleProvisionCustomerRequest(request, dependencies);
}

const env = Deno.env;
let handler: ReturnType<typeof createHandler> | null = null;

Deno.serve(async (request) => {
  try {
    if (!handler) {
      handler = createHandler(env);
    }
    return await handler(request);
  } catch {
    return new Response(
      JSON.stringify({ ok: false, error: "CONFIGURATION_INVALID" }),
      {
        status: 500,
        headers: { "content-type": "application/json; charset=utf-8" },
      },
    );
  }
});
