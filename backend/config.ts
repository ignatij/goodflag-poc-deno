import { load } from "@std/dotenv";

await load({ export: true });

const requiredEnv = ["GOODFLAG_BASE_URL", "GOODFLAG_API_KEY"] as const;

function getEnv(key: string, fallback?: string): string {
  const value = Deno.env.get(key) ?? fallback;
  if (value === undefined) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
}

const config = {
  goodflagBaseUrl: getEnv("GOODFLAG_BASE_URL"),
  goodflagApiKey: getEnv("GOODFLAG_API_KEY"),
  goodflagUserId: getEnv("GOODFLAG_USER_ID"),
  goodflagSignatureProfileId: getEnv("GOODFLAG_SIGNATURE_PROFILE_ID"),
  goodflagConsentPageId: Deno.env.get("GOODFLAG_CONSENT_PAGE_ID"),
  defaultLocale: Deno.env.get("GOODFLAG_DEFAULT_LOCALE") ?? "en",
  signatureField: {
    page: Number(Deno.env.get("SIGNATURE_FIELD_PAGE") ?? "-1"),
    x: Number(Deno.env.get("SIGNATURE_FIELD_X") ?? "390"),
    y: Number(Deno.env.get("SIGNATURE_FIELD_Y") ?? "710"),
    width: Number(Deno.env.get("SIGNATURE_FIELD_WIDTH") ?? "150"),
    height: Number(Deno.env.get("SIGNATURE_FIELD_HEIGHT") ?? "80"),
  },
  port: Number(getEnv("PORT", "8000")),
  frontendOrigin: Deno.env.get("FRONTEND_ORIGIN") ?? "*",
};

export type AppConfig = typeof config;

export default config;
