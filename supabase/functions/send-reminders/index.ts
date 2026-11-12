// Hantar notifikasi peringatan: pada masa peringatan (9:00 pagi jika tiada masa) dan
// peringatan awal pilihan (early_min minit sebelum). Dipanggil setiap 5 minit oleh pg_cron.
// Setiap amaran dicatat dalam reminder_log, jadi panggilan berulang tak hantar dua kali.
import webpush from "npm:web-push@3.6.7";
import { createClient } from "npm:@supabase/supabase-js@2.45.4";

const APP_URL = "https://zemi1991.github.io/wishlist-kita/";
const BULAN = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, apikey, content-type" };

// Kunci VAPID dijana sekali dan disimpan dalam jadual app_keys (hanya pelayan boleh baca).
async function vapidKeys(): Promise<{ publicKey: string; privateKey: string }> {
  const { data } = await sb.from("app_keys").select("public_key,private_key").eq("id", 1).maybeSingle();
  if (data) return { publicKey: data.public_key, privateKey: data.private_key };
  const k = webpush.generateVAPIDKeys();
  await sb.from("app_keys").upsert({ id: 1, public_key: k.publicKey, private_key: k.privateKey }, { onConflict: "id", ignoreDuplicates: true });
  const { data: saved } = await sb.from("app_keys").select("public_key,private_key").eq("id", 1).single();
  return { publicKey: saved!.public_key, privateKey: saved!.private_key };
}

const MYT = 8 * 3600e3;
const fmtDate = (iso: string) => { const [y, m, d] = iso.split("-").map(Number); return `${d} ${BULAN[m - 1]} ${y}`; };
const fmtTime = (t: string) => {
  const [h, m] = t.split(":").map(Number);
  const suf = h < 12 ? "AM" : "PM";
  return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${suf}`;
};
// Waktu peringatan (UTC ms) dari tarikh + masa waktu Malaysia; tiada masa = 9:00 pagi
const eventAt = (date: string, time?: string | null) => {
  const [y, mo, d] = date.split("-").map(Number);
  const [h, mi] = (time || "09:00").split(":").map(Number);
  return Date.UTC(y, mo - 1, d, h, mi) - MYT;
};
const before = (min: number) =>
  min % 10080 === 0 ? (min === 10080 ? "Next week" : `In ${min / 10080} weeks`)
  : min % 1440 === 0 ? (min === 1440 ? "Tomorrow" : `In ${min / 1440} days`)
  : min % 60 === 0 ? (min === 60 ? "In 1 hour" : `In ${min / 60} hours`)
  : `In ${min} minutes`;

const WINDOW = 60 * 60e3;

async function sendTo(subs: { endpoint: string; p256dh: string; auth: string }[], payload: Record<string, unknown>) {
  let sent = 0;
  for (const s of subs) {
    try {
      await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, JSON.stringify(payload));
      sent++;
    } catch (e) {
      const code = (e as { statusCode?: number }).statusCode;
      if (code === 404 || code === 410) await sb.from("push_subs").delete().eq("endpoint", s.endpoint);
    }
  }
  return sent;
}

async function notifyNewComment(id: string) {
  const json = (o: unknown) => new Response(JSON.stringify(o), { headers: { ...CORS, "Content-Type": "application/json" } });
  const { data: c } = await sb.from("comments").select("id,item_id,body,by_email,created_at").eq("id", id).maybeSingle();
  if (!c || !c.by_email || Date.now() - Date.parse(c.created_at) > 10 * 60e3) return json({ skipped: true });
  const { error: dup } = await sb.from("reminder_log").insert({ item_id: c.id, alert_at: c.created_at });
  if (dup) return json({ skipped: "already sent" });
  const { data: it } = await sb.from("items").select("title").eq("id", c.item_id).maybeSingle();
  const { data: who } = await sb.from("members").select("name").ilike("email", c.by_email).maybeSingle();
  const { data: subs } = await sb.from("push_subs").select("endpoint,p256dh,auth,email");
  const others = (subs ?? []).filter((s) => (s.email || "").toLowerCase() !== c.by_email.toLowerCase());
  const sent = await sendTo(others, {
    title: `${who?.name || "Your partner"} commented on ${it?.title || "an item"}`,
    body: String(c.body).slice(0, 160),
    tag: `cmt-${c.id}`,
    url: APP_URL,
  });
  return json({ new_comment: c.id, sent });
}

async function notifyNewItem(id: string) {
  const json = (o: unknown) => new Response(JSON.stringify(o), { headers: { ...CORS, "Content-Type": "application/json" } });
  const { data: it } = await sb.from("items").select("id,title,note,cat,by_email,created_at").eq("id", id).maybeSingle();
  // Hanya item yang baru dibuat (10 minit), dan sekali sahaja
  if (!it || !it.by_email || Date.now() - Date.parse(it.created_at) > 10 * 60e3) return json({ skipped: true });
  const { error: dup } = await sb.from("reminder_log").insert({ item_id: it.id, alert_at: it.created_at });
  if (dup) return json({ skipped: "already sent" });
  const { data: who } = await sb.from("members").select("name").ilike("email", it.by_email).maybeSingle();
  const { data: subs } = await sb.from("push_subs").select("endpoint,p256dh,auth,email");
  const others = (subs ?? []).filter((s) => (s.email || "").toLowerCase() !== it.by_email.toLowerCase());
  const name = who?.name || "Your partner";
  const sent = await sendTo(others, {
    title: it.cat === "ingat" ? `${name} added a reminder` : `${name} shared something`,
    body: [it.title, it.note].filter(Boolean).join(" · ").slice(0, 160),
    tag: `new-${it.id}`,
    url: APP_URL,
  });
  return json({ new_item: it.id, sent });
} // hantar yang terlepas sehingga 1 jam lewat

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  const keys = await vapidKeys();
  // App minta kunci awam untuk langgan notifikasi
  if (new URL(req.url).searchParams.has("key"))
    return new Response(JSON.stringify({ publicKey: keys.publicKey }), { headers: { ...CORS, "Content-Type": "application/json" } });
  webpush.setVapidDetails(APP_URL, keys.publicKey, keys.privateKey);

  // Item baru dikongsi: hantar notifikasi segera kepada pasangan (dipanggil oleh trigger database)
  const body = req.method === "POST" ? await req.json().catch(() => ({})) : {};
  if (body && body.new_item) return await notifyNewItem(String(body.new_item));
  if (body && body.new_comment) return await notifyNewComment(String(body.new_comment));

  const now = Date.now();
  const from = new Date(now + MYT - 864e5).toISOString().slice(0, 10);
  const to = new Date(now + MYT + 400 * 864e5).toISOString().slice(0, 10);
  const { data: items, error } = await sb.from("items")
    .select("id,title,date,at_time,early_min,note").eq("cat", "ingat").eq("done", false)
    .gte("date", from).lte("date", to);
  if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: CORS });

  const due: { title: string; body: string; tag: string }[] = [];
  for (const it of items ?? []) {
    const ev = eventAt(it.date, it.at_time);
    const when = [fmtDate(it.date), it.at_time ? fmtTime(it.at_time) : ""].filter(Boolean).join(", ");
    const alerts: { at: number; title: string }[] = [
      { at: ev, title: it.at_time ? `Now: ${it.title}` : `Today: ${it.title}` },
    ];
    if (it.early_min && it.early_min > 0) alerts.push({ at: ev - it.early_min * 60e3, title: `${before(it.early_min)}: ${it.title}` });
    for (const a of alerts) {
      if (a.at > now || a.at < now - WINDOW) continue;
      const { error: dup } = await sb.from("reminder_log").insert({ item_id: it.id, alert_at: new Date(a.at).toISOString() });
      if (dup) continue; // dah dihantar
      due.push({ title: a.title, body: [when, it.note].filter(Boolean).join(" · ").slice(0, 160), tag: `${it.id}-${a.at}` });
    }
  }

  let sent = 0;
  if (due.length) {
    const { data: subs } = await sb.from("push_subs").select("endpoint,p256dh,auth");
    for (const s of subs ?? []) {
      for (const n of due) {
        try {
          await webpush.sendNotification(
            { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
            JSON.stringify({ ...n, url: APP_URL }),
          );
          sent++;
        } catch (e) {
          const code = (e as { statusCode?: number }).statusCode;
          if (code === 404 || code === 410) { await sb.from("push_subs").delete().eq("endpoint", s.endpoint); break; }
        }
      }
    }
  }
  return new Response(JSON.stringify({ now: new Date(now).toISOString(), reminders: due.length, sent }), { headers: { ...CORS, "Content-Type": "application/json" } });
});
