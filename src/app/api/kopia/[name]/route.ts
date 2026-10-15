import fs from "node:fs";
import path from "node:path";
import { backupDir } from "@/lib/services/backup";

export const runtime = "nodejs";

export async function GET(_req: Request, ctx: RouteContext<"/api/kopia/[name]">) {
  const { name } = await ctx.params;
  if (!/^kopia-[\d-]+\.zip$/.test(name)) return new Response("Nieprawidłowa nazwa", { status: 400 });
  const file = path.join(backupDir(), name);
  if (!fs.existsSync(file)) return new Response("Nie znaleziono", { status: 404 });
  return new Response(new Uint8Array(fs.readFileSync(file)), {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${name}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
