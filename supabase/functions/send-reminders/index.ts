// Hantar notifikasi peringatan: pada masa peringatan (9:00 pagi jika tiada masa) dan
// peringatan awal pilihan (early_min minit sebelum). Dipanggil setiap 5 minit oleh pg_cron.
// Setiap amaran dicatat dalam reminder_log, jadi panggilan berulang tak hantar dua kali.
import webpush from "npm:web-push@3.6.7";
import { createClient } from "npm:@supabase/supabase-js@2.45.4";

const APP_URL = "https://zemi1991.github.io/wishlist-kita/";
const BULAN = ["Jan","Feb","Mac","Apr","Mei","Jun","Jul","Ogo","Sep","Okt","Nov","Dis"];

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
  const suf = h < 12 ? "pg" : h < 19 ? "ptg" : "mlm";
  return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${suf}`;
};
// Waktu peringatan (UTC ms) dari tarikh + masa waktu Malaysia; tiada masa = 9:00 pagi
const eventAt = (date: string, time?: string | null) => {
  const [y, mo, d] = date.split("-").map(Number);
  const [h, mi] = (time || "09:00").split(":").map(Number);
  return Date.UTC(y, mo - 1, d, h, mi) - MYT;
};
const before = (min: number) =>
  min % 10080 === 0 ? (min === 10080 ? "Minggu depan" : `Dalam ${min / 10080} minggu`)
  : min % 1440 === 0 ? (min === 1440 ? "Esok" : `Dalam ${min / 1440} hari`)
  : min % 60 === 0 ? `Dalam ${min / 60} jam`
  : `Dalam ${min} minit`;

const WINDOW = 60 * 60e3; // hantar yang terlepas sehingga 1 jam lewat

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  const keys = await vapidKeys();
  // App minta kunci awam untuk langgan notifikasi
  if (new URL(req.url).searchParams.has("key"))
    return new Response(JSON.stringify({ publicKey: keys.publicKey }), { headers: { ...CORS, "Content-Type": "application/json" } });
  webpush.setVapidDetails(APP_URL, keys.publicKey, keys.privateKey);

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
      { at: ev, title: it.at_time ? `Sekarang: ${it.title}` : `Hari ini: ${it.title}` },
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
