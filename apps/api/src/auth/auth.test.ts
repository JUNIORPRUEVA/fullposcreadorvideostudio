import assert from "node:assert/strict";
import test from "node:test";
import { hashPassword, verifyPassword } from "./password.js";
import {
  authTokenNeedsRenewal,
  authTokenRemainingSeconds,
  authTokenTtlSeconds,
  signAuthToken,
  verifyAuthToken
} from "./auth-token.js";

test("password hashes verify only the original password", async () => {
  const hash = await hashPassword("correct horse battery staple");
  assert.equal(await verifyPassword("correct horse battery staple", hash), true);
  assert.equal(await verifyPassword("wrong password", hash), false);
});

test("auth token verifies payload and rejects tampering", () => {
  const token = signAuthToken({ sub: "owner", email: "owner@example.com", role: "OWNER" }, "test-secret", 60);
  const payload = verifyAuthToken(token, "test-secret");
  assert.equal(payload?.email, "owner@example.com");
  assert.equal(verifyAuthToken(`${token}x`, "test-secret"), null);
  assert.equal(verifyAuthToken(token, "other-secret"), null);
});

test("session ttl is configurable so the studio does not ask to sign in again", () => {
  const previousDays = process.env.AUTH_TOKEN_TTL_DAYS;
  const previousSeconds = process.env.AUTH_TOKEN_TTL_SECONDS;
  try {
    delete process.env.AUTH_TOKEN_TTL_DAYS;
    delete process.env.AUTH_TOKEN_TTL_SECONDS;
    assert.equal(authTokenTtlSeconds(), 60 * 60 * 24 * 30);
    process.env.AUTH_TOKEN_TTL_DAYS = "3650";
    assert.equal(authTokenTtlSeconds(), 3650 * 24 * 60 * 60);
    process.env.AUTH_TOKEN_TTL_DAYS = "not-a-number";
    assert.equal(authTokenTtlSeconds(), 60 * 60 * 24 * 30);
    delete process.env.AUTH_TOKEN_TTL_DAYS;
    process.env.AUTH_TOKEN_TTL_SECONDS = "90";
    assert.equal(authTokenTtlSeconds(), 90);
  } finally {
    if (previousDays === undefined) delete process.env.AUTH_TOKEN_TTL_DAYS;
    else process.env.AUTH_TOKEN_TTL_DAYS = previousDays;
    if (previousSeconds === undefined) delete process.env.AUTH_TOKEN_TTL_SECONDS;
    else process.env.AUTH_TOKEN_TTL_SECONDS = previousSeconds;
  }
});

test("a session is renewed only after half of its life, and expires when it runs out", () => {
  const payload = { sub: "owner", email: "owner@example.com", role: "OWNER" as const };
  const fresh = verifyAuthToken(signAuthToken(payload, "test-secret", 1000), "test-secret");
  assert.ok(fresh);
  assert.equal(authTokenRemainingSeconds(fresh) > 0, true);
  assert.equal(authTokenNeedsRenewal(fresh, 1000), false);
  const halfSpent = verifyAuthToken(signAuthToken(payload, "test-secret", 100), "test-secret");
  assert.ok(halfSpent);
  assert.equal(authTokenNeedsRenewal(halfSpent, 1000), true);
  const expired = signAuthToken(payload, "test-secret", -1);
  assert.equal(verifyAuthToken(expired, "test-secret"), null);
});
