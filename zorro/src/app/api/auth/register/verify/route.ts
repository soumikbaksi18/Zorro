import type { RegistrationResponseJSON } from "@simplewebauthn/server";
import { finishRegistration } from "@/lib/passkeys";
import { jsonRoute, readJson } from "@/lib/route";

export async function POST(request: Request) {
  return jsonRoute(async () => {
    const user = await finishRegistration((await readJson(request)) as RegistrationResponseJSON);
    return { ok: true, userId: user.id };
  });
}
