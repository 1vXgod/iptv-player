/**
 * MAG portal API.
 *   POST /api/stalker {action:"login", portal, mac}   -> {channels, account, host}
 *   POST /api/stalker {action:"account", portal, mac} -> {account}
 */
import { isValidMac, portalAccount, PortalError, portalLogin } from "@/lib/stalker";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  let body: { action?: string; portal?: string; mac?: string };
  try { body = await req.json(); } catch { return Response.json({ error: "Invalid JSON" }, { status: 400 }); }
  const portal = String(body.portal || "").trim();
  const mac = String(body.mac || "").toUpperCase();
  if (!portal) return Response.json({ error: "Enter the portal URL" }, { status: 400 });
  if (!isValidMac(mac)) return Response.json({ error: "Invalid MAC address" }, { status: 400 });
  try {
    if (body.action === "login") return Response.json(await portalLogin(portal, mac));
    if (body.action === "account") return Response.json({ account: await portalAccount(portal, mac) });
    return Response.json({ error: "Unknown action" }, { status: 400 });
  } catch (e) {
    const msg = e instanceof PortalError ? e.message : `Portal error: ${(e as Error).message}`;
    return Response.json({ error: msg }, { status: 502 });
  }
}
