import { createHmac, timingSafeEqual } from "node:crypto";

type TokenPayload = {
  sub: string;
  email: string;
  role: "OWNER";
  exp: number;
};

/**
 * El estudio es de un unico dueño en una maquina local: 30 dias por defecto y, ademas,
 * el token se renueva solo mientras la sesion se use (ver `AuthService.me`). Para que no
 * haya que volver a entrar nunca, se fija `AUTH_TOKEN_TTL_DAYS` en el `.env` del API.
 */
const DEFAULT_TTL_SECONDS = 60 * 60 * 24 * 30;

/** Duracion de la sesion: `AUTH_TOKEN_TTL_DAYS` (dias) o `AUTH_TOKEN_TTL_SECONDS`. */
export function authTokenTtlSeconds() {
  const days = positiveNumber(process.env.AUTH_TOKEN_TTL_DAYS);
  if (days !== null) return Math.round(days * 24 * 60 * 60);
  const seconds = positiveNumber(process.env.AUTH_TOKEN_TTL_SECONDS);
  if (seconds !== null) return Math.round(seconds);
  return DEFAULT_TTL_SECONDS;
}

export function signAuthToken(payload: Omit<TokenPayload, "exp">, secret: string, ttlSeconds = authTokenTtlSeconds()) {
  const fullPayload: TokenPayload = { ...payload, exp: Math.floor(Date.now() / 1000) + ttlSeconds };
  const body = base64Url(JSON.stringify(fullPayload));
  const signature = createHmac("sha256", secret).update(body).digest("base64url");
  return `${body}.${signature}`;
}

/** Segundos de vida que le quedan al token (negativo si ya expiro). */
export function authTokenRemainingSeconds(payload: { exp: number }) {
  return payload.exp - Math.floor(Date.now() / 1000);
}

/**
 * Sesion deslizante: se renueva cuando al token le queda menos de la mitad de su vida,
 * de forma que una sesion que se usa de vez en cuando no caduca nunca.
 */
export function authTokenNeedsRenewal(payload: { exp: number }, ttlSeconds = authTokenTtlSeconds()) {
  return authTokenRemainingSeconds(payload) < ttlSeconds / 2;
}

function positiveNumber(value: string | undefined) {
  if (typeof value !== "string" || !value.trim()) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

export function verifyAuthToken(token: string, secret: string) {
  const [body, signature] = token.split(".");
  if (!body || !signature) return null;
  const expected = createHmac("sha256", secret).update(body).digest("base64url");
  if (!safeEqual(signature, expected)) return null;
  const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as TokenPayload;
  if (!payload.exp || payload.exp < Math.floor(Date.now() / 1000)) return null;
  return payload;
}

function base64Url(value: string) {
  return Buffer.from(value, "utf8").toString("base64url");
}

function safeEqual(left: string, right: string) {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}
