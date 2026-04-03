import { ClassSerializerInterceptor, ValidationPipe } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { NestExpressApplication } from "@nestjs/platform-express";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import bodyParser = require("body-parser");
import cookieParser = require("cookie-parser");
import { NextFunction, Request, Response } from "express";
import * as fs from "fs";
import { ConfigService } from "./config/config.service";
import { DATA_DIRECTORY } from "./constants";

export function parseApiCorsAllowedOrigins(config: ConfigService) {
  try {
    return new Set(
      config
        .get("api.corsAllowedOrigins")
        .split(",")
        .map((origin: string) => origin.trim())
        .filter(Boolean),
    );
  } catch {
    return new Set<string>();
  }
}

export async function configureNestApplication(
  app: NestExpressApplication,
) {
  app.useGlobalPipes(new ValidationPipe({ whitelist: true }));
  app.useGlobalInterceptors(new ClassSerializerInterceptor(app.get(Reflector)));

  const config = app.get<ConfigService>(ConfigService);

  app.use((req: Request, res: Response, next: NextFunction) => {
    const chunkSize = config.get("share.chunkSize");
    bodyParser.raw({
      type: "application/octet-stream",
      limit: `${chunkSize}B`,
    })(req, res, next);
  });

  app.use(cookieParser());
  app.set("trust proxy", true);

  await fs.promises.mkdir(`${DATA_DIRECTORY}/uploads/_temp`, {
    recursive: true,
  });

  app.setGlobalPrefix("api");

  const allowedApiOrigins = parseApiCorsAllowedOrigins(config);

  app.use("/api/v1", (req: Request, res: Response, next: NextFunction) => {
    const origin = req.headers.origin;

    if (!origin || !allowedApiOrigins.has(origin)) {
      return next();
    }

    res.header("Access-Control-Allow-Origin", origin);
    res.header("Vary", "Origin");
    res.header(
      "Access-Control-Allow-Methods",
      "GET, POST, PUT, PATCH, DELETE, OPTIONS",
    );
    res.header("Access-Control-Allow-Headers", "Authorization, Content-Type");

    if (req.method === "OPTIONS") {
      res.status(204).send();
      return;
    }

    next();
  });

  if (process.env.NODE_ENV == "development") {
    const swaggerConfig = new DocumentBuilder()
      .setTitle("Better Pingvin Share API")
      .setVersion("1.0")
      .addBearerAuth(
        {
          type: "http",
          scheme: "bearer",
          bearerFormat: "API Token",
          description: "Automation API token",
        },
        "api-token",
      )
      .addCookieAuth(
        "access_token",
        {
          type: "apiKey",
          in: "cookie",
        },
        "web-session",
      )
      .build();
    const document = SwaggerModule.createDocument(app, swaggerConfig);
    SwaggerModule.setup("api/swagger", app, document);
  }
}
