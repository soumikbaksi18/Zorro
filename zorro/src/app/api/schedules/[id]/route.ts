import { AgentError } from "@/lib/agent-service";
import { jsonRoute, readJson } from "@/lib/route";
import { ScheduleActionSchema, updateSchedule } from "@/lib/schedules";
import { requestOrigin, requireUser } from "@/lib/session";

/** Pause, resume, delete or pay now. */
export async function POST(request: Request, ctx: RouteContext<"/api/schedules/[id]">) {
  return jsonRoute(async () => {
    const user = await requireUser();
    await requestOrigin();
    const parsed = ScheduleActionSchema.safeParse(await readJson(request));
    if (!parsed.success) throw new AgentError("Invalid action");
    return updateSchedule(user, (await ctx.params).id, parsed.data.action);
  });
}
