import { connection } from "next/server";
import { AgentError } from "@/lib/agent-service";
import { jsonRoute, readJson } from "@/lib/route";
import { ScheduleInputSchema, createSchedule, listSchedules } from "@/lib/schedules";
import { requestOrigin, requireUser } from "@/lib/session";

export async function GET() {
  await connection();
  return jsonRoute(async () => listSchedules(await requireUser()));
}

/** Create an Autopay (weekly or monthly). */
export async function POST(request: Request) {
  return jsonRoute(async () => {
    const user = await requireUser();
    await requestOrigin();
    const parsed = ScheduleInputSchema.safeParse(await readJson(request));
    if (!parsed.success) throw new AgentError(parsed.error.issues[0]?.message ?? "Check the Autopay");
    return createSchedule(user, parsed.data);
  });
}
