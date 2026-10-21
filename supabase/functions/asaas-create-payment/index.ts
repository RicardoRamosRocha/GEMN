import { createClient } from "npm:@supabase/supabase-js@2";
import { AsaasClientError, createAsaasClientFromEnv } from "../asaas-client/index.ts";
import { PixOrchestrationError, createPixOrchestrator } from "../asaas-orchestrator/index.ts";
import { createSupabasePixAdapter } from "../asaas-supabase-adapter/index.ts";
import {
  corsHeaders,
  handleCreatePaymentRequest,
  type CreatePaymentResponse,
} from "./handler.ts";

const REQUIRED_ENV = [
  "SUPABASE_URL",
  "SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "ASAAS_BASE_URL",
  "ASAAS_ACCESS_TOKEN",
] as const;

function requireConfiguration(env: Pick<Deno.Env, "get">): void {
  for (const name of REQUIRED_ENV) {
    if (!env.get(name)?.trim()) throw new Error("payment configuration unavailable");
  }
}

function createHandler(env: Pick<Deno.Env, "get"> = Deno.env) {
  requireConfiguration(env);
  const url = env.get("SUPABASE_URL")!;
  const anonKey = env.get("SUPABASE_ANON_KEY")!;
  const serviceRoleKey = env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const adminClient = createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const buyerClientFactory = (token: string) => createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const asaas = createAsaasClientFromEnv(env);

  return (request: Request) => handleCreatePaymentRequest(request, {
    async create(input): Promise<CreatePaymentResponse> {
      const adapter = createSupabasePixAdapter({
        buyerClient: buyerClientFactory(input.token),
        adminClient: {
          async rpc(name, args) {
            return await adminClient.rpc(name, args);
          },
          from(table) {
            return adminClient.from(table) as never;
          },
        },
      });
      const result = await createPixOrchestrator({
        auth: adapter.auth,
        db: adapter.db,
        asaas,
      }).create({
        context: input.token,
        orderId: input.orderId,
        idempotencyKey: input.idempotencyKey,
      });
      let qr;
      try {
        qr = await asaas.getPixQrCode(result.asaasPaymentId);
      } catch (error) {
        if (error instanceof AsaasClientError && (error.uncertain || error.code === "TIMEOUT")) {
          throw new PixOrchestrationError(
            "ASAAS_TIMEOUT",
            "O resultado do QR Code não pôde ser confirmado.",
          );
        }
        throw new PixOrchestrationError(
          "ASAAS_UNAVAILABLE",
          "Não foi possível obter o QR Code.",
        );
      }
      return {
        paymentIntent: result.paymentIntent,
        customer: {
          id: result.customer.id,
          ambiente: result.customer.ambiente,
          status: result.customer.status,
        },
        payment: {
          status: result.paymentIntent.status === "qr_ready" ? "qr_ready" : "created",
          asaasPaymentId: result.asaasPaymentId,
          amountDueReal: result.paymentIntent.amountDueReal,
          externalReference: result.paymentIntent.externalReference,
        },
        qrCode: {
          encodedImage: qr.encodedImage,
          payload: qr.payload,
          expiresAt: qr.expirationDate,
        },
      };
    },
  });
}

const env = Deno.env;
let handler: ReturnType<typeof createHandler> | null = null;

Deno.serve(async (request) => {
  try {
    if (!handler) handler = createHandler(env);
    return await handler(request);
  } catch {
    return new Response(JSON.stringify({ ok: false, error: "CONFIGURATION_INVALID" }), {
      status: 500,
      headers: {
        "content-type": "application/json; charset=utf-8",
        ...Object.fromEntries(corsHeaders(request).entries()),
      },
    });
  }
});
