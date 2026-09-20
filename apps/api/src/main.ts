import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import type { NextFunction, Request, Response } from "express";
import { AppModule } from "./modules/app.module.js";
import { AuthService, authRequired, authSecret } from "./auth/auth.service.js";
import { verifyAuthToken } from "./auth/auth-token.js";

const port = Number(process.env.PORT ?? 4000);
const app = await NestFactory.create(AppModule);
const allowedOrigins = (process.env.CORS_ORIGINS ?? process.env.PWA_ORIGIN ?? "")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

app.enableCors({
  origin: allowedOrigins.length > 0 ? allowedOrigins : [/^http:\/\/localhost:\d+$/],
  methods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
  credentials: true
});

await app.get(AuthService).bootstrapFromEnvironment();

app.use((request: Request, response: Response, next: NextFunction) => {
  if (!authRequired()) return next();
  const path = request.path ?? request.url ?? "";
  if (path === "/health" || path.startsWith("/auth/")) return next();
  if (request.method === "GET" && /^\/brands\/[^/]+\/assets\/[^/]+\/public-image$/.test(path)) return next();
  const authorization = request.headers.authorization;
  const token = typeof authorization === "string" && authorization.startsWith("Bearer ") ? authorization.slice("Bearer ".length) : "";
  if (token && verifyAuthToken(token, authSecret())) return next();
  response.status(401).json({ message: "Authentication required." });
});

await app.listen(port);
console.log(`Video Studio API listening on http://localhost:${port}`);
