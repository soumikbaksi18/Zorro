import { after } from "next/server";
import { AgentError } from "@/lib/agent-service";
import { jsonRoute, readJson } from "@/lib/route";
import { ScheduleActionSchema, updateSchedule } from "@/lib/schedules";
import { requestOrigin, requireUser } from "@/lib/session";
import { nudgeUser } from "@/lib/worker";

/** Pause, resume, delete or pay now. */
export async function POST(request: Request, ctx: RouteContext<"/api/schedules/[id]">) {
  return jsonRoute(async () => {
    const user = await requireUser();
    await requestOrigin();
    const parsed = ScheduleActionSchema.safeParse(await readJson(request));
    if (!parsed.success) throw new AgentError("Invalid action");
    const result = await updateSchedule(user, (await ctx.params).id, parsed.data.action);
    if (result.paymentId) after(() => nudgeUser(user.id).catch(() => {}));
    return result;
  });
}
