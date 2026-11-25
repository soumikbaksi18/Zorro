import { connection } from "next/server";
import { AgentError } from "@/lib/agent-service";
import { CreateBotSchema, createBot, listBots } from "@/lib/bots/service";
import { jsonRoute, readJson } from "@/lib/route";
import { requestOrigin, requireUser } from "@/lib/session";

export async function GET() {
  await connection();
  return jsonRoute(async () => listBots(await requireUser()));
}

export async function POST(request: Request) {
  return jsonRoute(async () => {
    const user = await requireUser();
    await requestOrigin();
    const parsed = CreateBotSchema.safeParse(await readJson(request));
    if (!parsed.success) throw new AgentError(parsed.error.issues[0]?.message ?? "Check the bot settings");
    return createBot(user, parsed.data);
  });
}
