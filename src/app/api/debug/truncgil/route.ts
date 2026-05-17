// Geçici debug endpoint — Truncgil yanıtının anahtar listesini döndürür.
// XAU eşleşme sorununu teşhis için. Çözüm bulunca silinecek.
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const res = await fetch("https://finans.truncgil.com/v4/today.json", {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; MehmetsAssets/1.0)",
        Accept: "application/json",
      },
      cache: "no-store",
    });
    const text = await res.text();
    let json: Record<string, unknown> = {};
    try {
      json = JSON.parse(text);
    } catch {
      return Response.json({ status: res.status, raw_first_2000: text.slice(0, 2000) });
    }
    const keys = Object.keys(json);
    // Altın, gram, gold içeren anahtarları öne çıkar
    const goldish = keys.filter((k) =>
      /alt[ıi]n|gold|gram|gümüş|gumus|silver|ons/i.test(k),
    );
    const sample: Record<string, unknown> = {};
    for (const k of goldish.slice(0, 20)) sample[k] = json[k];
    return Response.json({
      status: res.status,
      total_keys: keys.length,
      goldish_keys: goldish,
      goldish_samples: sample,
      all_keys: keys,
    });
  } catch (err) {
    return Response.json({ error: String(err) }, { status: 500 });
  }
}
