// Shared error handling for API route handlers.

import { AgentError } from "./agent-service";
import { AuthError } from "./session";

export async function jsonRoute(fn: () => Promise<unknown>): Promise<Response> {
  try {
    return Response.json(await fn(), { headers: { "cache-control": "no-store" } });
  } catch (e) {
    if (e instanceof AuthError || e instanceof AgentError) {
      return Response.json({ error: e.message }, { status: e.status });
    }
    console.error("route failed", e instanceof Error ? e.message : e);
    return Response.json({ error: "Something went wrong. Please try again." }, { status: 500 });
  }
}

export async function readJson(request: Request): Promise<unknown> {
  return request.json().catch(() => {
    throw new AuthError("Invalid request body");
  });
}
