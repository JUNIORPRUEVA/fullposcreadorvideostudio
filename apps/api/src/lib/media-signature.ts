import { createHmac, timingSafeEqual } from "node:crypto";

/*
 * Los medios (MP4 de previews, renders) se sirven a traves de un tag <video>,
 * que no puede enviar la cabecera Authorization. Para que el navegador pueda
 * pedirlos sin token se firma la ruta con HMAC y una caducidad corta: la URL
 * solo sirve para ese archivo y durante unos minutos.
 */

const DEFAULT_TTL_SECONDS = 15 * 60;

function signatureFor(pathname: string, expiresAt: number, secret: string) {
  return createHmac("sha256", secret).update(`${pathname}:${expiresAt}`).digest("base64url");
}

export function signMediaUrl(pathname: string, secret: string, ttlSeconds = DEFAULT_TTL_SECONDS) {
  const expiresAt = Math.floor(Date.now() / 1000) + ttlSeconds;
  const signature = signatureFor(pathname, expiresAt, secret);
  return `${pathname}?sig=${signature}&exp=${expiresAt}`;
}

export function verifyMediaSignature(pathname: string, signature: string, expires: string | undefined, secret: string) {
  const expiresAt = Number(expires);
  if (!Number.isFinite(expiresAt) || expiresAt < Math.floor(Date.now() / 1000)) return false;
  const expected = Buffer.from(signatureFor(pathname, expiresAt, secret));
  const provided = Buffer.from(signature);
  if (expected.length !== provided.length) return false;
  return timingSafeEqual(expected, provided);
}
