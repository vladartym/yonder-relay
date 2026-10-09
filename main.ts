// The Yonder relay. It joins the bridge of Yonder on a computer and the Yonder app on a phone, and forwards their frames.
// The phone and the bridge encrypt the frames end to end, so the relay cannot read or change them.
// Yonder runs this relay at wss://relay.yonder.so. README.md tells how to run your own.
//   /host?token=T  the bridge of a computer. Its room is a hash of its secret token.
//   /phone?room=R  a phone. The relay gives each phone a number, so that more phones can use one computer.
//   /privacy       the privacy policy of the phone app, for Google Play.
// To the bridge, a binary frame starts with the number of the phone (4 bytes). Text frames are control
// messages: {"open":n} and {"close":n} from the relay, {"close":n,"reason":"..."} and "ping" from the bridge.
import type { ServerWebSocket } from "bun";

// seen: the time of the last ping of a bridge. device: the end of the public key of a phone, for the statistics.
// place: where the socket came from, from the headers of Cloudflare. The relay never sends the IP address.
type Place = { country?: string; city?: string; lat?: string; lon?: string };
type Peer = { room: string; id: number; host: boolean; seen: number; device?: string; app?: string; model?: string; place: Place };

// The bridge pings every 3 seconds. A Mac that sleeps sends nothing, but its socket can stay open for minutes.
// So a bridge with no ping for 15 seconds is offline, and the phones show it.
const SILENT = 15_000;

// A phone that knows the room cannot act as the Mac, because only the Mac knows the token. The bridge makes the same hash
// for the QR code (roomOf in bridge/relay.ts of Yonder), so the two must stay the same.
export async function roomOf(token: string) {
  const hash = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token)));
  return btoa(String.fromCharCode(...hash.subarray(0, 16))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

// STATS_URL and STATS_TOKEN send the open and the close of each socket to a statistics server, for Yonder the
// site yonder.so (POST /api/relay/events). Without STATS_URL, the relay sends nothing. A failure never stops the relay.
// The events go one at a time, in order. When the site does not answer or answers 5xx, as during a deploy of about
// 15 seconds, the relay tries the event again after 1, 2, 4, 8 and 16 seconds. Before, a close lost in a deploy left
// a phone online on the backstage until the Mac connected again.
type Event = { event: "open" | "close" | "refused"; role: "host" | "phone"; key?: number; device?: string; app?: string; model?: string; code?: number; reason?: string } & Place;
let sending = Promise.resolve();
function stat(mac: string, e: Event) {
  if (!process.env.STATS_URL) return;
  const headers = { "content-type": "application/json", authorization: `Bearer ${process.env.STATS_TOKEN ?? ""}` };
  const body = JSON.stringify({ ...e, mac, at: Date.now() });
  // ponytail: one queue for all rooms, so a long outage of the site delays each event; drop old events if that matters.
  sending = sending.then(async () => {
    for (let wait = 1000; ; wait *= 2) {
      const sent = await fetch(process.env.STATS_URL!, { method: "POST", headers, body, signal: AbortSignal.timeout(5000) }).then((r) => r.status < 500, () => false);
      if (sent || wait > 16000) return;
      await Bun.sleep(wait);
    }
  });
}

// `rooms` keeps strangers off the relay: only these Macs can connect. `tap` sees each frame, for the check.
export function serveRelay(port: number, { rooms, tap, silent = SILENT }: { rooms?: string[]; tap?: (frame: Uint8Array) => void; silent?: number } = {}) {
  const hosts = new Map<string, ServerWebSocket<Peer>>();
  const phones = new Map<number, ServerWebSocket<Peer>>();
  const phonesOf = (room: string) => [...phones.values()].filter((p) => p.data.room === room);
  // The bridge of the room, if it pinged in time.
  const live = (room: string) => {
    const host = hosts.get(room);
    return host && Date.now() - host.data.seen < silent ? host : undefined;
  };
  let next = 0;
  return Bun.serve<Peer>({
    port,
    async fetch(req, server) {
      const url = new URL(req.url);
      if (url.pathname === "/privacy") return new Response(Bun.file(new URL("privacy.html", import.meta.url)));
      const host = url.pathname === "/host";
      if (!host && url.pathname !== "/phone") return new Response("Yonder relay", { status: url.pathname === "/" ? 200 : 404 });
      const token = url.searchParams.get("token") ?? "";
      const room = host ? (token.length >= 32 ? await roomOf(token) : "") : (url.searchParams.get("room") ?? "");
      if (!/^[\w-]{22}$/.test(room) || (host && rooms?.length && !rooms.includes(room))) return new Response("Forbidden", { status: 403 });
      const device = url.searchParams.get("device")?.slice(0, 32) || undefined;
      // The app version and the model of a phone, or the kind of computer of a bridge, for the backstage.
      const app = url.searchParams.get("app")?.slice(0, 40) || undefined;
      const model = url.searchParams.get("model")?.slice(0, 80) || undefined;
      const h = (name: string) => req.headers.get(name) || undefined;
      const place = { country: h("cf-ipcountry"), city: h("cf-ipcity"), lat: h("cf-iplatitude"), lon: h("cf-iplongitude") };
      const data = { room, id: ++next, host, seen: Date.now(), device, app, model, place };
      return server.upgrade(req, { data }) ? undefined : new Response("Use a WebSocket", { status: 426 });
    },
    websocket: {
      // An image from the phone is 20 MB at most, and a long conversation is a few MB.
      maxPayloadLength: 64 << 20,
      backpressureLimit: 64 << 20,
      closeOnBackpressureLimit: true,
      // Frees the socket of a Mac that sleeps. The phones see it as offline after `silent` already.
      idleTimeout: 60,
      open(ws) {
        const { room, id, host, device, app, model, place } = ws.data;
        if (host) {
          // The bridge connects again after a drop. The phones then start new sessions with it.
          const old = hosts.get(room);
          hosts.set(room, ws);
          stat(room, { event: "open", role: "host", key: id, app, model, ...place });
          old?.close(4000, "Another bridge took the room");
          for (const p of phonesOf(room)) p.close(4004, "The Mac connected again");
        } else if (!live(room)) {
          ws.close(4004, "The Mac is offline");
          stat(room, { event: "refused", role: "phone", device, app, model, ...place });
        } else {
          phones.set(id, ws);
          stat(room, { event: "open", role: "phone", key: id, device, app, model, ...place });
          hosts.get(room)!.send(JSON.stringify({ open: id }));
        }
      },
      message(ws, msg) {
        const { room, id, host } = ws.data;
        if (!host) {
          if (typeof msg === "string") return;
          const mac = live(room);
          if (!mac) return ws.close(4004, "The Mac is offline");
          tap?.(msg);
          const out = new Uint8Array(4 + msg.length);
          new DataView(out.buffer).setUint32(0, id);
          out.set(msg, 4);
          mac.send(out);
        } else if (typeof msg !== "string") {
          tap?.(msg.subarray(4));
          const phone = phones.get(new DataView(msg.buffer, msg.byteOffset).getUint32(0));
          if (phone?.data.room === room) phone.send(msg.subarray(4));
        } else if (msg === "ping") {
          ws.data.seen = Date.now();
          ws.send("pong");
        } else {
          try {
            const { close, reason } = JSON.parse(msg);
            const phone = phones.get(close);
            if (phone?.data.room === room) phone.close(4003, String(reason ?? "Closed by the Mac").slice(0, 120));
          } catch {}
        }
      },
      close(ws, code, reason) {
        const { room, id, host } = ws.data;
        if (!host) {
          // A refused phone was never in `phones`, and its refusal is already in the statistics.
          if (!phones.delete(id)) return;
          stat(room, { event: "close", role: "phone", key: id, code, reason: reason.slice(0, 120) });
          hosts.get(room)?.send(JSON.stringify({ close: id }));
        } else {
          stat(room, { event: "close", role: "host", key: id, code, reason: reason.slice(0, 120) });
          if (hosts.get(room) !== ws) return;
          hosts.delete(room);
          for (const p of phonesOf(room)) p.close(4004, "The Mac is offline");
        }
      },
    },
  });
}

if (import.meta.main) {
  const server = serveRelay(Number(process.env.PORT ?? 8080), { rooms: process.env.ROOMS?.split(",").filter(Boolean) });
  console.log(`Yonder relay on port ${server.port}`);
}
