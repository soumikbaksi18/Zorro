import type { AuthenticationResponseJSON } from "@simplewebauthn/server";
import { finishLogin } from "@/lib/passkeys";
import { jsonRoute, readJson } from "@/lib/route";

export async function POST(request: Request) {
  return jsonRoute(async () => {
    const user = await finishLogin((await readJson(request)) as AuthenticationResponseJSON);
    return { ok: true, userId: user.id };
  });
}
