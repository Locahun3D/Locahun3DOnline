/**
 * Environment variable validation — import once at app startup.
 * Warns for missing optional keys, throws for missing required keys in production.
 */

const required = [
  "NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY",
  "CLERK_SECRET_KEY",
] as const;

const recommended = [
  "STRIPE_SECRET_KEY",
  "STRIPE_WEBHOOK_SECRET",
  "NEXT_PUBLIC_APP_URL",
] as const;

function validate() {
  const missing = required.filter((k) => !process.env[k]);
  const missingRecommended = recommended.filter((k) => !process.env[k]);

  for (const key of missingRecommended) {
    console.warn(`[env] Missing recommended: ${key}`);
  }

  if (missing.length > 0 && process.env.NODE_ENV === "production") {
    throw new Error(
      `[env] Missing required environment variables: ${missing.join(", ")}`,
    );
  } else if (missing.length > 0) {
    console.warn(
      `[env] Missing required (non-fatal in dev): ${missing.join(", ")}`,
    );
  }
}

validate();
