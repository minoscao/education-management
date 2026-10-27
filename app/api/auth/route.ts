import { env } from "cloudflare:workers";
import type { Database } from "../../lib/learning-store";
import {
  AccessError,
  PortalAuth,
  checkOrigin,
  passwordHash,
} from "../../lib/portal-auth";
import {
  BusinessWorkflow,
  RegistrationError,
} from "../../lib/business-workflow";
const database = () => env.DB as unknown as Database;
const auth = () => new PortalAuth(database());
const config = () => env as unknown as Record<string, string | undefined>;
function errorResponse(error: unknown) {
  return Response.json(
    {
      error:
        error instanceof AccessError
          ? error.message
          : "The account could not be saved. Check the details or sign in to an existing account.",
      fields: error instanceof RegistrationError ? error.fields : undefined,
    },
    { status: error instanceof AccessError ? error.status : 409 },
  );
}
export async function GET(request: Request) {
  try {
    const initialized = Boolean(
      await database()
        .prepare(
          "SELECT key FROM app_settings WHERE key='portal_admin_initialized'",
        )
        .first(),
    );
    let actor = null;
    try {
      actor = await auth().actor(request);
    } catch {
      /* An absent session is expected on the sign-in screen. */
    }
    return Response.json(
      {
        actor,
        initialized,
        local: ["localhost", "127.0.0.1", "[::1]"].includes(
          new URL(request.url).hostname,
        ),
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return Response.json(
      {
        error: "Apply the local database migrations before opening the portal.",
      },
      { status: 503 },
    );
  }
}
export async function POST(request: Request) {
  try {
    checkOrigin(request);
    const body = await request.text();
    if (body.length > 64000)
      throw new AccessError("This form is too large.", 413);
    let input: Record<string, unknown>;
    try {
      input = JSON.parse(body);
    } catch {
      throw new AccessError("This form is not valid JSON.", 400);
    }
    if (!input || typeof input !== "object" || Array.isArray(input))
      throw new AccessError("Choose an account action.", 400);
    const service = auth();
    let cookie = "";
    if (input.action === "bootstrap")
      cookie = await service.bootstrap(
        {
          email: String(input.email || ""),
          password: String(input.password || ""),
          name: String(input.name || ""),
          secret: String(input.secret || ""),
        },
        request,
        config().PORTAL_BOOTSTRAP_SECRET,
      );
    else if (input.action === "login")
      cookie = await service.login(
        String(input.email || ""),
        String(input.password || ""),
        request,
      );
    else if (input.action === "logout") cookie = await service.logout(request);
    else if (input.action === "register") {
      if (
        !(await database()
          .prepare(
            "SELECT key FROM app_settings WHERE key='portal_admin_initialized'",
          )
          .first())
      )
        throw new AccessError(
          "The campus administrator must finish setup first.",
          403,
        );
      const result = await new BusinessWorkflow(database()).submitRegistration(
        input,
        undefined,
        await passwordHash(String(input.password || "")),
      );
      cookie = await service.issue(result.accountId, request);
    } else throw new AccessError("Unknown account action.", 400);
    return Response.json(
      { ok: true },
      { headers: { "Set-Cookie": cookie, "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return errorResponse(error);
  }
}
