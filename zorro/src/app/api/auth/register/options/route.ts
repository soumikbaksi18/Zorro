import { beginRegistration } from "@/lib/passkeys";
import { jsonRoute } from "@/lib/route";

export async function POST() {
  return jsonRoute(() => beginRegistration());
}
