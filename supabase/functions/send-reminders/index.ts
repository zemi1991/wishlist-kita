// Hantar notifikasi peringatan: sehari sebelum ("Esok") dan pada hari ("Hari ini").
// Dipanggil setiap pagi 9:00 (waktu Malaysia) oleh pg_cron. Setiap peringatan dihantar sekali sahaja
// untuk setiap jenis, jadi panggilan berulang tak akan hantar notifikasi berganda.
import webpush from "npm:web-push@3.6.7";
import { createClient } from "npm:@supabase/supabase-js@2.45.4";

const APP_URL = "https://zemi1991.github.io/wishlist-kita/";
const BULAN = ["Jan","Feb","Mac","Apr","Mei","Jun","Jul","Ogo","Sep","Okt","Nov","Dis"];

webpush.setVapidDetails(APP_URL, Deno.env.get("VAPID_PUBLIC_KEY")!, Deno.env.get("VAPID_PRIVATE_KEY")!);
const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

const klDate = (offsetDays: number) =>
  new Date(Date.now() + 8 * 3600e3 + offsetDays * 864e5).toISOString().slice(0, 10);
const fmt = (iso: string) => { const [y, m, d] = iso.split("-").map(Number); return `${d} ${BULAN[m - 1]} ${y}`; };

Deno.serve(async () => {
  const today = klDate(0), tomorrow = klDate(1);
  const { data: items, error } = await sb.from("items")
    .select("id,title,date,note").eq("cat", "ingat").eq("done", false).in("date", [today, tomorrow]);
  if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500 });

  const due: { title: string; body: string; tag: string }[] = [];
  for (const it of items ?? []) {
    const kind = it.date === today ? "hari" : "esok";
    const { error: dup } = await sb.from("reminder_log").insert({ item_id: it.id, kind, day: today });
    if (dup) continue; // dah dihantar
    due.push({
      title: kind === "hari" ? `Hari ini: ${it.title}` : `Esok: ${it.title}`,
      body: [fmt(it.date), it.note].filter(Boolean).join(" · ").slice(0, 160),
      tag: `${it.id}-${kind}`,
    });
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
  return new Response(JSON.stringify({ today, reminders: due.length, sent }), { headers: { "Content-Type": "application/json" } });
});
