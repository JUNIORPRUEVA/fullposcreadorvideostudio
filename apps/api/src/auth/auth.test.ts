import assert from "node:assert/strict";
import test from "node:test";
import { hashPassword, verifyPassword } from "./password.js";
import { signAuthToken, verifyAuthToken } from "./auth-token.js";

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
