// Bots for the signed-in user: create, list, view, pause/resume/stop. Server-side only.

import { randomUUID } from "node:crypto";
import { and, count, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { AgentError, activeAgentFor, agentWithGrant } from "../agent-service";
import type { CurrentUser } from "../session";
import { BOT_LABEL, BotConfigSchema, describeBot, type BotConfig, type BotState } from "./config";
import { distanceToTrigger } from "./engine";
import { addEvent, getDemoPrice, workerHeartbeat, zecPrice } from "./runner";

const MAX_BOTS_PER_WALLET = 10;

export const CreateBotSchema = z.object({ name: z.string().trim().min(1).max(60).optional(), config: BotConfigSchema });

export type BotView = {
  id: string;
  name: string;
  kind: BotConfig["kind"];
  mode: BotConfig["mode"];
  status: string;
  description: string;
  createdAt: string;
  config: BotConfig;
  state: BotState;
};

function view(row: typeof schema.bots.$inferSelect): BotView {
  const config = BotConfigSchema.parse(row.config);
  return {
    id: row.id,
    name: row.name,
    kind: config.kind,
    mode: config.mode,
    status: row.status,
    description: describeBot(config),
    createdAt: row.createdAt.toISOString(),
    config,
    state: (row.state ?? {}) as BotState,
  };
}

async function walletFor(user: CurrentUser) {
  const agent = await activeAgentFor(user.id);
  if (!agent || agent.status !== "ACTIVE") throw new AgentError("Create your bot wallet first.", 409);
  return agent;
}

export async function listBots(user: CurrentUser): Promise<BotView[]> {
  const agent = await activeAgentFor(user.id);
  if (!agent) return [];
  const rows = await db.select().from(schema.bots).where(eq(schema.bots.agentId, agent.id)).orderBy(desc(schema.bots.createdAt));
  return rows.map(view);
}

export async function createBot(user: CurrentUser, input: z.infer<typeof CreateBotSchema>): Promise<BotView> {
  const agent = await walletFor(user);
  if (input.config.mode === "live") await agentWithGrant(user); // live bots need a valid permission
  const [{ n }] = await db.select({ n: count() }).from(schema.bots).where(eq(schema.bots.agentId, agent.id));
  if (n >= MAX_BOTS_PER_WALLET) throw new AgentError(`You can have up to ${MAX_BOTS_PER_WALLET} bots.`, 409);

  const id = randomUUID();
  const name = input.name ?? `${BOT_LABEL[input.config.kind]}${input.config.mode === "paper" ? " (paper)" : ""}`;
  await db.insert(schema.bots).values({ id, agentId: agent.id, kind: input.config.kind, name, config: input.config as unknown as Record<string, unknown>, state: {}, status: "active" });
  await addEvent(id, "info", `${input.config.mode === "paper" ? "Paper bot" : "Live bot"} started: ${describeBot(input.config)}.`);
  return view((await ownedBot(user, id)).row);
}

async function ownedBot(user: CurrentUser, id: string) {
  const agent = await walletFor(user);
  const [row] = await db.select().from(schema.bots).where(and(eq(schema.bots.id, id), eq(schema.bots.agentId, agent.id))).limit(1);
  if (!row) throw new AgentError("Bot not found.", 404);
  return { row, agent };
}

export type BotDetail = BotView & {
  events: { at: string; level: string; message: string; correlationId: string | null }[];
  price: { priceUsd: number; source: string } | null;
  trigger: { triggerUsd: number; pct: number } | null;
  demoPrice: number | null;
  workerSeenAt: string | null;
};

export async function getBot(user: CurrentUser, id: string): Promise<BotDetail> {
  const { row } = await ownedBot(user, id);
  const bot = view(row);
  const [events, price, demo, heartbeat] = await Promise.all([
    db.select().from(schema.botEvents).where(eq(schema.botEvents.botId, id)).orderBy(desc(schema.botEvents.at), desc(schema.botEvents.id)).limit(50),
    zecPrice().catch(() => null),
    getDemoPrice(),
    workerHeartbeat(),
  ]);
  return {
    ...bot,
    events: events.map((e) => ({ at: e.at.toISOString(), level: e.level, message: e.message, correlationId: e.correlationId })),
    price,
    trigger: price ? distanceToTrigger(bot.config, bot.state, price.priceUsd) : null,
    demoPrice: demo?.priceUsd ?? null,
    workerSeenAt: heartbeat,
  };
}

export const BotActionSchema = z.object({ action: z.enum(["pause", "resume", "stop"]) });

export async function updateBot(user: CurrentUser, id: string, action: z.infer<typeof BotActionSchema>["action"]): Promise<BotView> {
  const { row } = await ownedBot(user, id);
  const state = (row.state ?? {}) as BotState;
  if (row.status === "stopped") throw new AgentError("This bot has finished. Create a new one.", 409);
  if (action === "resume" && state.completedAt) throw new AgentError("This bot has finished.", 409);

  const status = action === "pause" ? "paused" : action === "resume" ? "active" : "stopped";
  // Stopping never cancels a trade already on its way; the worker still records how it settles.
  await db
    .update(schema.bots)
    .set({ status, state: (action === "resume" ? { ...state, lastError: undefined, failures: 0 } : state) as Record<string, unknown> })
    .where(eq(schema.bots.id, id));
  const verb = { pause: "Paused", resume: "Resumed", stop: "Stopped" }[action];
  await addEvent(id, "info", `${verb} by you.${action === "stop" && state.inFlight ? " A trade already sent will still settle." : ""}`);
  return view((await ownedBot(user, id)).row);
}
