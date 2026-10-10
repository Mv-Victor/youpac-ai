const CONVEX_URL_ENV_VAR = "VITE_CONVEX_URL";

export function getConvexServerUrl(): string {
  const convexUrl = process.env[CONVEX_URL_ENV_VAR]?.trim();

  if (!convexUrl) {
    throw new Error(
      `${CONVEX_URL_ENV_VAR} is required for server-side Convex requests. Configure it before starting the app.`,
    );
  }

  return convexUrl;
}
