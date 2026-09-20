import { Body, Controller, Get, Headers, Inject, Post } from "@nestjs/common";
import { AuthService } from "./auth.service.js";

@Controller("auth")
export class AuthController {
  constructor(@Inject(AuthService) private readonly auth: AuthService) {}

  @Get("status")
  status() {
    return this.auth.status();
  }

  @Post("login")
  login(@Body() body: Record<string, unknown>) {
    return this.auth.login(body);
  }

  @Get("me")
  me(@Headers("authorization") authorization?: string) {
    return this.auth.me(authorization);
  }
}
