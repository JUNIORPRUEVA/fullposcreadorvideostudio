import { Controller, Get } from "@nestjs/common";

@Controller("health")
export class HealthController {
  @Get()
  health() {
    return {
      ok: true,
      service: "fullpos-video-studio-api",
      timestamp: new Date().toISOString()
    };
  }
}
