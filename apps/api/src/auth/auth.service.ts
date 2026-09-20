import { BadRequestException, Inject, Injectable, UnauthorizedException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service.js";
import { hashPassword, verifyPassword } from "./password.js";
import { signAuthToken } from "./auth-token.js";

const ownerKey = "auth.owner";

type OwnerRecord = {
  id: string;
  email: string;
  passwordHash: string;
  role: "OWNER";
  createdAt: string;
};

@Injectable()
export class AuthService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async status() {
    const owner = await this.getOwner();
    return {
      ownerConfigured: Boolean(owner),
      authRequired: authRequired()
    };
  }

  async bootstrapFromEnvironment() {
    const existing = await this.getOwner();
    if (existing) return { ownerConfigured: true, created: false };
    const email = process.env.OWNER_EMAIL?.trim();
    const password = process.env.OWNER_PASSWORD;
    if (!email || !password) return { ownerConfigured: false, created: false };
    await this.createOwner(email, password);
    return { ownerConfigured: true, created: true };
  }

  async login(body: Record<string, unknown>) {
    const email = stringField(body.email, "email").toLowerCase();
    const password = stringField(body.password, "password");
    const owner = await this.getOwner();
    if (!owner || owner.email.toLowerCase() !== email || !(await verifyPassword(password, owner.passwordHash))) {
      throw new UnauthorizedException("Invalid credentials.");
    }
    return {
      token: signAuthToken({ sub: owner.id, email: owner.email, role: owner.role }, authSecret()),
      user: { email: owner.email, role: owner.role }
    };
  }

  async me(authorization?: string) {
    const token = authorization?.startsWith("Bearer ") ? authorization.slice("Bearer ".length) : "";
    if (!token) throw new UnauthorizedException("Missing token.");
    const { verifyAuthToken } = await import("./auth-token.js");
    const payload = verifyAuthToken(token, authSecret());
    if (!payload) throw new UnauthorizedException("Invalid token.");
    return { email: payload.email, role: payload.role };
  }

  private async getOwner() {
    const stored = await this.prisma.appSetting.findUnique({ where: { key: ownerKey } });
    return stored ? JSON.parse(stored.value) as OwnerRecord : null;
  }

  private async createOwner(email: string, password: string) {
    if (password.length < 12) throw new BadRequestException("OWNER_PASSWORD must be at least 12 characters.");
    const owner: OwnerRecord = {
      id: "owner",
      email,
      passwordHash: await hashPassword(password),
      role: "OWNER",
      createdAt: new Date().toISOString()
    };
    await this.prisma.appSetting.upsert({
      where: { key: ownerKey },
      create: { key: ownerKey, value: JSON.stringify(owner) },
      update: { value: JSON.stringify(owner) }
    });
  }
}

export function authRequired() {
  return process.env.AUTH_REQUIRED === "true" || process.env.NODE_ENV === "production";
}

export function authSecret() {
  const secret = process.env.JWT_SECRET ?? process.env.AUTH_SECRET;
  if (!secret && authRequired()) throw new Error("JWT_SECRET is required when authentication is enabled.");
  return secret ?? "local-development-auth-secret";
}

function stringField(value: unknown, field: string) {
  if (typeof value !== "string" || !value.trim()) throw new BadRequestException(`${field} is required.`);
  return value.trim();
}
