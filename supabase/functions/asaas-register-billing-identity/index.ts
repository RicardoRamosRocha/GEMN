import { createClient } from "npm:@supabase/supabase-js@2";
import {
  type BillingIdentityRegistrationAdminPort,
  createBillingIdentityRegistrationAdapter,
} from "../billing-identity-registration-adapter/index.ts";
import { createBillingIdentityRegistrar } from "../billing-identity-registration/index.ts";
import { handleRegisterBillingIdentityRequest } from "./handler.ts";

const REQUIRED_ENV = [
  "SUPABASE_URL",
  "SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "GEMN_BILLING_ACTIVE_KEY_VERSION",
] as const;

function validateConfiguration(env: Pick<Deno.Env, "get">): void {
  for (const name of REQUIRED_ENV) {
    if (!env.get(name)?.trim()) throw new Error("configuration unavailable");
  }
  const version = env.get("GEMN_BILLING_ACTIVE_KEY_VERSION");
  if (!version || !/^[1-9][0-9]{0,8}$/.test(version)) {
    throw new Error("configuration unavailable");
  }
  if (
    !env.get(`GEMN_BILLING_ENCRYPTION_KEY_V${version}`)?.trim() ||
    !env.get(`GEMN_BILLING_HMAC_KEY_V${version}`)?.trim()
  ) throw new Error("configuration unavailable");
}

const env = Deno.env;
let handler: ((request: Request) => Promise<Response>) | null = null;

function createHandler() {
  validateConfiguration(env);
  const url = env.get("SUPABASE_URL")!;
  const anonKey = env.get("SUPABASE_ANON_KEY")!;
  const serviceRoleKey = env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const adminClient = createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const buyerClientFactory = (accessToken: string) =>
    createClient(url, anonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { Authorization: `Bearer ${accessToken}` } },
    });
  const adminPort: BillingIdentityRegistrationAdminPort = {
    async rpc(name, args) {
      return await adminClient.rpc(name, args);
    },
    from(table) {
      const tableClient = adminClient.from(table);
      const queryPort = (
        columns: string,
        filters: Array<[string, string]> = [],
        ordering: { column: string; ascending: boolean } | null = null,
        limit: number | null = null,
      ) => ({
        eq(column: string, value: string) {
          return queryPort(
            columns,
            [...filters, [column, value]],
            ordering,
            limit,
          );
        },
        order(column: string, options: { ascending: boolean }) {
          return queryPort(columns, filters, {
            column,
            ascending: options.ascending,
          }, limit);
        },
        limit(count: number) {
          return queryPort(columns, filters, ordering, count);
        },
        async maybeSingle() {
          if (filters.length === 2 && ordering === null && limit === null) {
            return await tableClient.select(columns)
              .eq(filters[0][0], filters[0][1])
              .eq(filters[1][0], filters[1][1])
              .maybeSingle();
          }
          if (filters.length === 1 && ordering === null && limit === null) {
            return await tableClient.select(columns)
              .eq(filters[0][0], filters[0][1])
              .maybeSingle();
          }
          if (ordering !== null && limit !== null) {
            return await tableClient.select(columns)
              .eq(filters[0][0], filters[0][1])
              .order(ordering.column, { ascending: ordering.ascending })
              .limit(limit)
              .maybeSingle();
          }
          return await tableClient.select(columns).maybeSingle();
        },
        async single() {
          return await tableClient.select(columns).maybeSingle();
        },
      });
      return {
        select(columns) {
          return queryPort(columns);
        },
        async insert(values) {
          return await tableClient.insert(values);
        },
      };
    },
  };
  const db = createBillingIdentityRegistrationAdapter({
    adminClient: adminPort,
  });
  const registrar = createBillingIdentityRegistrar({ db, cryptoEnv: env });
  return (request: Request) =>
    handleRegisterBillingIdentityRequest(request, {
      async authenticate(accessToken) {
        const { data, error } = await buyerClientFactory(accessToken).auth
          .getUser(accessToken);
        if (error || !data.user?.id) return null;
        return { userId: data.user.id };
      },
      async register(userId, orderId, document) {
        return await registrar.register(userId, orderId, document);
      },
    });
}

Deno.serve(async (request) => {
  try {
    handler ??= createHandler();
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
