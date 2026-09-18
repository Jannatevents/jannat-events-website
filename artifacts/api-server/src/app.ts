import express, { type Express, type NextFunction, type Request, type Response } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import { clerkMiddleware } from "@clerk/express";
import { publishableKeyFromHost } from "@clerk/shared/keys";
import {
  CLERK_PROXY_PATH,
  clerkProxyMiddleware,
  getClerkProxyHost,
} from "./middlewares/clerkProxyMiddleware";
import healthRouter from "./routes/health";
import router from "./routes";
import { logger } from "./lib/logger";

const app: Express = express();

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
app.use("/api", healthRouter);
app.use(CLERK_PROXY_PATH, clerkProxyMiddleware());
const allowedOrigins = (process.env.CORS_ORIGINS || "")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);
const corsOrigin = allowedOrigins.length
  ? allowedOrigins
  : process.env.NODE_ENV === "production"
    ? false
    : true;
app.use(cors({
  origin: corsOrigin,
  credentials: true,
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(
  clerkMiddleware((req) => ({
    publishableKey: publishableKeyFromHost(
      getClerkProxyHost(req) ?? "",
      process.env.CLERK_PUBLISHABLE_KEY,
    ),
  })),
);

app.use("/api", router);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function redactDiagnosticText(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  return value
    .replace(/[a-z][a-z\d+.-]*:\/\/[^\s"'<>]+/gi, "[REDACTED_URL]")
    .replace(/\b(?:password|passwd|pwd|user|username|host|port|dbname|database|connectionString)\s*=\s*(?:"[^"]*"|'[^']*'|[^\s,;]+)/gi, "$1=[REDACTED]")
    .replace(/\b(?:user|username|role)\s+(?:"[^"]*"|'[^']*'|[A-Za-z0-9_.@-]+)/gi, "$1 [REDACTED]");
}

app.use((error: unknown, _req: Request, _res: Response, next: NextFunction) => {
  if (isRecord(error) && isRecord(error.cause) && (error.name === "DrizzleQueryError" || typeof error.query === "string")) {
    const cause = error.cause;
    logger.error({
      databaseCause: {
        message: redactDiagnosticText(cause.message),
        code: redactDiagnosticText(cause.code),
        detail: redactDiagnosticText(cause.detail),
        hint: redactDiagnosticText(cause.hint),
        routine: redactDiagnosticText(cause.routine),
      },
    }, "Database query failed");
  }
  next(error);
});

export default app;
