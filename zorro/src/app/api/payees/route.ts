import { connection } from "next/server";
import { AgentError } from "@/lib/agent-service";
import { AddPayeeSchema, addPayee, listPayees } from "@/lib/payees";
import { jsonRoute, readJson } from "@/lib/route";
import { requestOrigin, requireUser } from "@/lib/session";

export async function GET() {
  await connection();
  return jsonRoute(async () => listPayees(await requireUser()));
}

/** Add a payee (it waits for Face ID approval before it can be paid). */
export async function POST(request: Request) {
  return jsonRoute(async () => {
    const user = await requireUser();
    await requestOrigin();
    const parsed = AddPayeeSchema.safeParse(await readJson(request));
    if (!parsed.success) throw new AgentError(parsed.error.issues[0]?.message ?? "Check the payee");
    return addPayee(user, parsed.data);
  });
}
