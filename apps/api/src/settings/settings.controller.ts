import { Body, Controller, Get, Inject, Put } from "@nestjs/common";
import { SettingsService } from "./settings.service.js";

@Controller("settings")
export class SettingsController {
  constructor(@Inject(SettingsService) private readonly settings: SettingsService) {}

  @Get()
  get() {
    return this.settings.get();
  }

  @Put()
  save(@Body() body: Record<string, unknown>) {
    return this.settings.save(body);
  }
}
