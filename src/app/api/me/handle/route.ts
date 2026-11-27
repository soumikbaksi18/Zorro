import { z } from "zod";
import { AgentError } from "@/lib/agent-service";
import { setHandle } from "@/lib/handles";
import { jsonRoute, readJson } from "@/lib/route";
import { requestOrigin, requireUser } from "@/lib/session";

const Body = z.object({ handle: z.string().max(40) });

/** Set the @handle other Zorro users can pay. */
export async function POST(request: Request) {
  return jsonRoute(async () => {
    const user = await requireUser();
    await requestOrigin();
    const parsed = Body.safeParse(await readJson(request));
    if (!parsed.success) throw new AgentError("Enter a handle");
    return { handle: await setHandle(user, parsed.data.handle) };
  });
}
