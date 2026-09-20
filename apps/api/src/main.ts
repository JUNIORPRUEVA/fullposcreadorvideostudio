import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "./modules/app.module.js";

const port = Number(process.env.PORT ?? 4000);
const app = await NestFactory.create(AppModule);

app.enableCors({
  origin: [/^http:\/\/localhost:\d+$/],
  methods: ["GET", "POST", "PATCH", "OPTIONS"]
});

await app.listen(port);
console.log(`FullPOS Ad Studio API listening on http://localhost:${port}`);
