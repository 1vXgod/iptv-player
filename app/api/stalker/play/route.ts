/**
 * GET /api/stalker/play?p=<portal>&m=<mac>&c=<cmd>
 * Resolves a portal channel to a fresh stream link and redirects to it. Portal links are
 * short-lived tokens, so channels from a MAC portal point here instead of at the stream.
 * The proxy, ffmpeg and the recorder all follow the redirect.
 */
import { isValidMac, portalStreamUrl } from "@/lib/stalker";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const q = new URL(req.url).searchParams;
  const portal = q.get("p") || "";
  const mac = (q.get("m") || "").toUpperCase();
  const cmd = q.get("c") || "";
  if (!portal || !cmd || !isValidMac(mac)) return Response.json({ error: "Missing portal, MAC or channel" }, { status: 400 });
  try {
    const url = await portalStreamUrl(portal, mac, cmd);
    return new Response(null, { status: 302, headers: { Location: url, "Cache-Control": "no-store" } });
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 502 });
  }
}
