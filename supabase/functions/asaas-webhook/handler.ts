const DEFAULT_MAX_BODY_BYTES = 256 * 1024;
const MAX_EVENT_ID_LENGTH = 255;
const MAX_EVENT_TYPE_LENGTH = 100;
const MAX_PAYMENT_ID_LENGTH = 255;
const MAX_EXTERNAL_REFERENCE_LENGTH = 255;
const MAX_PROVIDER_STATUS_LENGTH = 100;
const MAX_DATE_CREATED_LENGTH = 64;

const DATE_WITH_EXPLICIT_TIMEZONE =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,6}))?(Z|[+-]\d{2}:\d{2})$/i;
const DATE_WITHOUT_TIMEZONE =
  /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,6}))?$/;

export interface AsaasWebhookPersistenceInput {
  p_asaas_event_id: string;
  p_event_type: string;
  p_asaas_payment_id: string;
  p_external_reference: string | null;
  p_provider_status: string;
  p_payment_value: number;
  p_net_value: number | null;
  p_occurred_at: string | null;
  p_payload_hash: string;
  p_source_date_created: string;
}

export interface AsaasWebhookPersistenceResult {
  webhook_event_id: string;
  duplicate: boolean;
  hash_conflict: boolean;
  persisted: boolean;
  processing_status: string;
  reason_code: string | null;
  payment_intent_id: string | null;
}

export interface AsaasWebhookHandlerDependencies {
  persist(input: AsaasWebhookPersistenceInput): Promise<AsaasWebhookPersistenceResult>;
  env?: Pick<Deno.Env, "get">;
  maxBodyBytes?: number;
}

class InvalidWebhookRequest extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "InvalidWebhookRequest";
    this.status = status;
  }
}

function jsonResponse(body: Record<string, unknown>, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "cache-control": "no-store",
      "content-type": "application/json; charset=utf-8",
    },
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requiredText(value: unknown, field: string, maxLength: number): string {
  if (typeof value !== "string") {
    throw new InvalidWebhookRequest(400, `${field} must be a string`);
  }
  const normalized = value.trim();
  if (!normalized || normalized.length > maxLength) {
    throw new InvalidWebhookRequest(400, `${field} is invalid`);
  }
  return normalized;
}

function optionalText(
  value: unknown,
  field: string,
  maxLength: number,
): string | null {
  if (value === undefined || value === null) return null;
  return requiredText(value, field, maxLength);
}

function nonNegativeFiniteNumber(value: unknown, field: string): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    throw new InvalidWebhookRequest(400, `${field} is invalid`);
  }
  return value;
}

function isValidDateComponents(match: RegExpExecArray): boolean {
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = Number(match[4]);
  const minute = Number(match[5]);
  const second = Number(match[6]);
  if (month < 1 || month > 12 || hour > 23 || minute > 59 || second > 59) return false;
  const leapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const daysInMonth = [31, leapYear ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return day >= 1 && day <= daysInMonth[month - 1];
}

function pad(value: number, length: number): string {
  return String(value).padStart(length, "0");
}

function parseFractionMicros(fraction: string | undefined): number {
  return Number((fraction ?? "").padEnd(6, "0"));
}

function explicitDateToUtc(match: RegExpExecArray): string {
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = Number(match[4]);
  const minute = Number(match[5]);
  const second = Number(match[6]);
  const fractionMicros = parseFractionMicros(match[7]);
  const offsetSign = match[8][0] === "-" ? -1 : 1;
  const offsetHours = Number(match[8].slice(1, 3));
  const offsetMinutes = Number(match[8].slice(4, 6));

  if (offsetHours > 23 || offsetMinutes > 59) {
    throw new InvalidWebhookRequest(400, "dateCreated is invalid");
  }

  const localDate = new Date(0);
  localDate.setUTCFullYear(year, month - 1, day);
  localDate.setUTCHours(hour, minute, second, 0);
  if (Number.isNaN(localDate.getTime())) {
    throw new InvalidWebhookRequest(400, "dateCreated is invalid");
  }

  const offsetTotalMinutes = offsetSign * (offsetHours * 60 + offsetMinutes);
  const utcMillis = localDate.getTime() - offsetTotalMinutes * 60_000 + Math.floor(fractionMicros / 1_000);
  const utcDate = new Date(utcMillis);
  const utcYear = utcDate.getUTCFullYear();
  if (utcYear < 0 || utcYear > 9999) {
    throw new InvalidWebhookRequest(400, "dateCreated is invalid");
  }

  return `${pad(utcYear, 4)}-${pad(utcDate.getUTCMonth() + 1, 2)}-${pad(utcDate.getUTCDate(), 2)}T` +
    `${pad(utcDate.getUTCHours(), 2)}:${pad(utcDate.getUTCMinutes(), 2)}:${pad(utcDate.getUTCSeconds(), 2)}.` +
    `${pad(fractionMicros, 6)}Z`;
}

function parseOccurredAt(value: unknown): { sourceDateCreated: string; occurredAt: string | null } {
  if (typeof value !== "string") {
    throw new InvalidWebhookRequest(400, "dateCreated must be a string");
  }
  const raw = value;
  if (!raw || raw.length > MAX_DATE_CREATED_LENGTH || raw !== raw.trim()) {
    throw new InvalidWebhookRequest(400, "dateCreated is invalid");
  }

  const explicitMatch = DATE_WITH_EXPLICIT_TIMEZONE.exec(raw);
  if (explicitMatch) {
    if (!isValidDateComponents(explicitMatch)) {
      throw new InvalidWebhookRequest(400, "dateCreated is invalid");
    }
    return { sourceDateCreated: raw, occurredAt: explicitDateToUtc(explicitMatch) };
  }

  const ambiguousMatch = DATE_WITHOUT_TIMEZONE.exec(raw);
  if (!ambiguousMatch || !isValidDateComponents(ambiguousMatch)) {
    throw new InvalidWebhookRequest(400, "dateCreated is invalid");
  }
  return { sourceDateCreated: raw, occurredAt: null };
}

async function readBodyBytes(request: Request, maxBodyBytes: number): Promise<Uint8Array> {
  const contentLength = request.headers.get("content-length");
  if (contentLength !== null) {
    const declaredLength = Number(contentLength);
    if (!Number.isSafeInteger(declaredLength) || declaredLength < 0) {
      throw new InvalidWebhookRequest(400, "content-length is invalid");
    }
    if (declaredLength > maxBodyBytes) {
      throw new InvalidWebhookRequest(413, "request body is too large");
    }
  }

  if (!request.body) return new Uint8Array();

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const result = await reader.read();
      if (result.done) break;
      total += result.value.byteLength;
      if (total > maxBodyBytes) {
        await reader.cancel();
        throw new InvalidWebhookRequest(413, "request body is too large");
      }
      chunks.push(result.value);
    }
  } finally {
    reader.releaseLock();
  }

  const body = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return body;
}

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digestInput = new Uint8Array(bytes.byteLength);
  digestInput.set(bytes);
  const digest = await crypto.subtle.digest("SHA-256", digestInput.buffer);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function timingSafeTokenEquals(expected: string, received: string): boolean {
  const encoder = new TextEncoder();
  const expectedBytes = encoder.encode(expected);
  const receivedBytes = encoder.encode(received);
  const length = Math.max(expectedBytes.length, receivedBytes.length);
  let difference = expectedBytes.length ^ receivedBytes.length;
  for (let index = 0; index < length; index += 1) {
    difference |= (expectedBytes[index] ?? 0) ^ (receivedBytes[index] ?? 0);
  }
  return difference === 0;
}

function configuredWebhookToken(env: Pick<Deno.Env, "get">): string {
  const token = env.get("ASAAS_WEBHOOK_AUTH_TOKEN");
  if (!token || token.length < 32 || token.length > 255 || /\s/u.test(token)) {
    throw new Error("ASAAS webhook authentication is not configured");
  }
  return token;
}

function parsePayload(text: string): Record<string, unknown> {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    throw new InvalidWebhookRequest(400, "request body is not valid JSON");
  }
  if (!isRecord(value)) {
    throw new InvalidWebhookRequest(400, "request body must be a JSON object");
  }
  return value;
}

function normalizePayload(
  payload: Record<string, unknown>,
  payloadHash: string,
): AsaasWebhookPersistenceInput {
  const eventId = requiredText(payload.id, "id", MAX_EVENT_ID_LENGTH);
  const eventType = requiredText(payload.event, "event", MAX_EVENT_TYPE_LENGTH);
  const { sourceDateCreated, occurredAt } = parseOccurredAt(payload.dateCreated);

  if (!isRecord(payload.payment)) {
    throw new InvalidWebhookRequest(400, "payment must be an object");
  }
  const payment = payload.payment;
  const paymentId = requiredText(payment.id, "payment.id", MAX_PAYMENT_ID_LENGTH);
  const providerStatus = requiredText(payment.status, "payment.status", MAX_PROVIDER_STATUS_LENGTH);
  const paymentValue = nonNegativeFiniteNumber(payment.value, "payment.value");
  const netValue = payment.netValue === undefined || payment.netValue === null
    ? null
    : nonNegativeFiniteNumber(payment.netValue, "payment.netValue");
  const externalReference = optionalText(
    payment.externalReference,
    "payment.externalReference",
    MAX_EXTERNAL_REFERENCE_LENGTH,
  );

  return {
    p_asaas_event_id: eventId,
    p_event_type: eventType,
    p_asaas_payment_id: paymentId,
    p_external_reference: externalReference,
    p_provider_status: providerStatus,
    p_payment_value: paymentValue,
    p_net_value: netValue,
    p_occurred_at: occurredAt,
    p_payload_hash: payloadHash,
    p_source_date_created: sourceDateCreated,
  };
}

export function createAsaasWebhookHandler(
  dependencies: AsaasWebhookHandlerDependencies,
): (request: Request) => Promise<Response> {
  const env = dependencies.env ?? Deno.env;
  const maxBodyBytes = dependencies.maxBodyBytes ?? DEFAULT_MAX_BODY_BYTES;

  return async (request: Request): Promise<Response> => {
    if (request.method !== "POST") {
      return jsonResponse({ ok: false, error: "METHOD_NOT_ALLOWED" }, 405);
    }

    let expectedToken: string;
    try {
      expectedToken = configuredWebhookToken(env);
    } catch {
      return jsonResponse({ ok: false, error: "CONFIGURATION_INVALID" }, 500);
    }

    const receivedToken = request.headers.get("asaas-access-token");
    if (!receivedToken || receivedToken.length > 255 || !timingSafeTokenEquals(expectedToken, receivedToken)) {
      return jsonResponse({ ok: false, error: "UNAUTHORIZED" }, 401);
    }

    const contentType = request.headers.get("content-type")?.split(";", 1)[0].trim().toLowerCase();
    if (contentType !== "application/json") {
      return jsonResponse({ ok: false, error: "UNSUPPORTED_MEDIA_TYPE" }, 415);
    }

    try {
      const bodyBytes = await readBodyBytes(request, maxBodyBytes);
      let bodyText: string;
      try {
        bodyText = new TextDecoder("utf-8", { fatal: true }).decode(bodyBytes);
      } catch {
        throw new InvalidWebhookRequest(400, "request body is not valid UTF-8");
      }
      const payloadHash = await sha256Hex(bodyBytes);
      const input = normalizePayload(parsePayload(bodyText), payloadHash);
      const result = await dependencies.persist(input);

      if (!result.persisted) {
        return jsonResponse({ ok: false, error: "PERSISTENCE_NOT_CONFIRMED" }, 503);
      }

      // Deliberately return no payment or personal data to the public sender.
      return jsonResponse({ ok: true }, 200);
    } catch (error) {
      if (error instanceof InvalidWebhookRequest) {
        return jsonResponse({ ok: false, error: error.status === 413 ? "PAYLOAD_TOO_LARGE" : "INVALID_REQUEST" }, error.status);
      }
      return jsonResponse({ ok: false, error: "PERSISTENCE_UNAVAILABLE" }, 503);
    }
  };
}

export {
  DEFAULT_MAX_BODY_BYTES,
  parseOccurredAt,
  sha256Hex,
  timingSafeTokenEquals,
};
