import { connection } from "next/server";
import { ledgerCsv } from "@/lib/payments";
import { getCurrentUser } from "@/lib/session";

/** Download the whole ledger as CSV. */
export async function GET() {
  await connection();
  const user = await getCurrentUser();
  if (!user) return new Response("Sign in first", { status: 401 });
  const csv = await ledgerCsv(user);
  return new Response(csv, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="zorro-payments-${new Date().toISOString().slice(0, 10)}.csv"`,
      "cache-control": "no-store",
    },
  });
}
