/**
 * Google Play yetkilendirmesi.
 *
 * PARA YOLUNDAKİ HATA SESSİZDİR. İki yönü de kötü: ödeyen kullanıcı
 * kilitli kalır ve iade ister, ödemeyen bedava kullanır ve gelir hiç
 * gelmez. Çalışma anında ikisi de hata vermez — yalnızca test yakalar.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  entitlementFrom,
  parsePurchases,
  purchaseFailureText,
  type PlayPurchase,
} from "./billing.ts";

const DAY = 24 * 3600_000;
const NOW = 1_800_000_000_000;

function buy(over: Partial<PlayPurchase> = {}): PlayPurchase {
  return {
    productId: "even_pro_monthly",
    purchaseToken: "tok-abc",
    purchaseTimeMs: NOW - 2 * DAY,
    state: "purchased",
    acknowledged: true,
    autoRenewing: true,
    ...over,
  };
}

test("geçerli aylık satın alma 30 gün PRO verir", () => {
  const e = entitlementFrom([buy()], NOW);
  assert.equal(e.pro, true);
  assert.equal(e.source, "play");
  assert.equal(e.untilMs, NOW - 2 * DAY + 30 * DAY);
});

test("satın alma yoksa PRO yok", () => {
  const e = entitlementFrom([], NOW);
  assert.deepEqual(e, { pro: false, untilMs: 0, source: "none", needsAcknowledge: [] });
});

/**
 * BU TESTİN ENGELLEDİĞİ HATA: Play'de PENDING, kullanıcının "mağazada
 * nakit ödeyeceğim" dediği durumdur. Para henüz alınmamıştır. Bunu
 * kabul etmek, hiç ödeme almadan PRO açmak demek.
 */
test("PENDING satın alma PRO VERMEZ — para henüz alınmadı", () => {
  const e = entitlementFrom([buy({ state: "pending" })], NOW);
  assert.equal(e.pro, false);
  assert.equal(e.untilMs, 0);
});

test("belirsiz durum da PRO vermez", () => {
  assert.equal(entitlementFrom([buy({ state: "unspecified" })], NOW).pro, false);
});

test("token'sız kayıt yok sayılır", () => {
  assert.equal(entitlementFrom([buy({ purchaseToken: "" })], NOW).pro, false);
});

test("bilinmeyen ürün PRO vermez — kaç gün olduğu bilinemez", () => {
  assert.equal(entitlementFrom([buy({ productId: "even_pro_lifetime" })], NOW).pro, false);
  assert.equal(entitlementFrom([buy({ productId: "" })], NOW).pro, false);
});

test("süresi geçmiş satın alma PRO vermez", () => {
  const e = entitlementFrom([buy({ purchaseTimeMs: NOW - 40 * DAY })], NOW);
  assert.equal(e.pro, false);
  assert.equal(e.untilMs, 0);
});

test("bitiş anının TAM üstünde PRO biter", () => {
  const start = NOW - 30 * DAY;
  assert.equal(entitlementFrom([buy({ purchaseTimeMs: start })], NOW).pro, false);
  assert.equal(entitlementFrom([buy({ purchaseTimeMs: start + 1 })], NOW).pro, true);
});

/**
 * Abonelik yenilendiğinde Play YENİ bir kayıt döndürür, eskisi de listede
 * kalabilir. En büyüğü almazsak yenileme sonrası kullanıcı kilitlenir.
 */
test("yenilemede EN GEÇ biten kazanır", () => {
  const eski = buy({ purchaseTimeMs: NOW - 29 * DAY, purchaseToken: "eski" });
  const yeni = buy({ purchaseTimeMs: NOW - 1 * DAY, purchaseToken: "yeni" });
  const e = entitlementFrom([eski, yeni], NOW);
  assert.equal(e.untilMs, NOW - 1 * DAY + 30 * DAY);
  // Sıra değişince sonuç değişmemeli.
  assert.equal(entitlementFrom([yeni, eski], NOW).untilMs, e.untilMs);
});

test("haftalık, aylık, yıllık paketler doğru gün sayısını verir", () => {
  const t = NOW - DAY;
  for (const [productId, days] of [
    ["even_pro_weekly", 7],
    ["even_pro_monthly", 30],
    ["even_pro_yearly", 365],
  ] as const) {
    const e = entitlementFrom([buy({ productId, purchaseTimeMs: t })], NOW);
    assert.equal(e.untilMs, t + days * DAY, productId);
  }
});

/**
 * Onaylanmamış satın almayı Play 3 GÜN SONRA İADE EDER. Kullanıcı parasını
 * geri alır, PRO'su gider ve kimse sebebini anlamaz.
 */
test("onaylanmamış satın alma listelenir", () => {
  const e = entitlementFrom([buy({ acknowledged: false, purchaseToken: "onaysiz" })], NOW);
  assert.equal(e.pro, true);
  assert.deepEqual(e.needsAcknowledge, ["onaysiz"]);
});

test("onaylı satın alma listeye girmez", () => {
  assert.deepEqual(entitlementFrom([buy({ acknowledged: true })], NOW).needsAcknowledge, []);
});

test("PENDING onay listesine de girmez", () => {
  const e = entitlementFrom([buy({ state: "pending", acknowledged: false })], NOW);
  assert.deepEqual(e.needsAcknowledge, []);
});

test("bozuk kayıtlar çökertmez, yok sayılır", () => {
  const e = entitlementFrom(
    [null, undefined, 42, "satın aldım", {}, { productId: "even_pro_monthly" }, buy()],
    NOW,
  );
  assert.equal(e.pro, true); // yalnızca gerçek kayıt sayıldı
});

test("sayı olmayan zaman damgası yok sayılır", () => {
  assert.equal(entitlementFrom([buy({ purchaseTimeMs: Number.NaN })], NOW).pro, false);
  assert.equal(
    entitlementFrom([buy({ purchaseTimeMs: Number.POSITIVE_INFINITY })], NOW).pro,
    false,
  );
});

// ─── JSON ayrıştırma ──────────────────────────────────────────────────

test("bozuk JSON boş dizi verir — FAIL-CLOSED", () => {
  // Ters varsayım (hatada PRO açmak) bedava abonelik dağıtırdı.
  assert.deepEqual(parsePurchases("{bozuk"), []);
  assert.deepEqual(parsePurchases(""), []);
  assert.deepEqual(parsePurchases("   "), []);
  assert.deepEqual(parsePurchases(undefined), []);
  assert.deepEqual(parsePurchases(null), []);
  assert.deepEqual(parsePurchases(123), []);
});

test("dizi olmayan JSON boş dizi verir", () => {
  assert.deepEqual(parsePurchases('{"productId":"even_pro_monthly"}'), []);
  assert.deepEqual(parsePurchases('"tek dize"'), []);
});

test("geçerli JSON dizisi çözülür ve yetkiye dönüşür", () => {
  const json = JSON.stringify([buy()]);
  assert.equal(entitlementFrom(parsePurchases(json), NOW).pro, true);
});

test("her hata sebebinin kullanıcıya gösterilecek metni var", () => {
  for (const r of ["no-bridge", "not-ready", "unknown-sku", "unsupported", "not-completed"] as const) {
    const text = purchaseFailureText(r);
    assert.ok(text.length > 10, r);
    // Mağaza adı geçmeli ya da net bir eylem söylemeli — boş nezaket değil.
    assert.ok(/Play|satın alma|paket|sürüm/i.test(text), `${r}: ${text}`);
  }
});

// ─── NATIVE KÖPRÜ ─────────────────────────────────────────────────────
//
// Bu bölüm mutasyon testinden sonra eklendi. Ölçüldü: `purchase()` içindeki
// "köprü yoksa hata döndür" satırını "köprü yoksa PRO aç" ile değiştirdiğimde
// YUKARIDAKİ 19 TESTİN HİÇBİRİ kırmızıya dönmedi — yani uygulamanın gelir
// modelini yok eden tam o hatayı hiçbir test görmüyordu. Saf yetki mantığını
// test etmek yeterli değil; köprüyle konuşan yolun da testi olmalı.

const billingWindow = () => globalThis as unknown as { window?: unknown };

/** Sahte `window` kurar ve sökme işlevini döndürür. */
function withWindow(bridge: unknown, run: (w: Record<string, unknown>) => void | Promise<void>) {
  const w: Record<string, unknown> = {
    EvenBilling: bridge,
    setTimeout: (fn: () => void, ms: number) => globalThis.setTimeout(fn, ms),
    clearTimeout: (id: unknown) => globalThis.clearTimeout(id as never),
  };
  const g = billingWindow();
  const had = "window" in g;
  const prev = g.window;
  g.window = w;
  try {
    return run(w);
  } finally {
    if (had) g.window = prev;
    else delete g.window;
  }
}

test("köprü yokken faturalandırma kullanılamaz", async () => {
  const { billingAvailable, billingBridge } = await import("./billing.ts");
  await withWindow(undefined, () => {
    assert.equal(billingBridge(), null);
    assert.equal(billingAvailable(), false);
  });
});

test("isReady false diyorsa kullanılamaz", async () => {
  const { billingAvailable } = await import("./billing.ts");
  await withWindow({ isReady: () => false, launchPurchase: () => {} }, () => {
    assert.equal(billingAvailable(), false);
  });
});

test("isReady yoksa köprünün varlığı yeterli", async () => {
  const { billingAvailable } = await import("./billing.ts");
  await withWindow({ launchPurchase: () => {} }, () => {
    assert.equal(billingAvailable(), true);
  });
});

/**
 * ESKİ KODUN TAM HATASI. Köprü yoksa (tarayıcı, eski WebView kabuğu)
 * satın alma BAŞARISIZ olmalı. "Yine de aç" demek, uygulamanın gelirini
 * sıfırlar ve kullanıcıya olmamış bir satın almayı olmuş gösterir.
 */
test("KÖPRÜ YOKKEN satın alma PRO AÇMAZ", async () => {
  const { purchase } = await import("./billing.ts");
  await withWindow(undefined, async () => {
    const r = await purchase("monthly");
    assert.equal(r.ok, false);
    assert.equal(r.ok === false && r.reason, "no-bridge");
  });
});

test("BillingClient hazır değilse satın alma PRO açmaz", async () => {
  const { purchase } = await import("./billing.ts");
  await withWindow({ isReady: () => false, launchPurchase: () => {} }, async () => {
    const r = await purchase("monthly");
    assert.equal(r.ok === false && r.reason, "not-ready");
  });
});

test("köprü launchPurchase sunmuyorsa satın alma PRO açmaz", async () => {
  const { purchase } = await import("./billing.ts");
  await withWindow({ isReady: () => true }, async () => {
    const r = await purchase("monthly");
    assert.equal(r.ok === false && r.reason, "unsupported");
  });
});

test("satın alma akışı doğru ürün kimliğini gönderir ve sonucu bekler", async () => {
  const { purchase } = await import("./billing.ts");
  const launched: string[] = [];
  const acked: string[] = [];
  const bridge = {
    isReady: () => true,
    launchPurchase: (id: string) => {
      launched.push(id);
      // Native taraf sonucu geri yazar.
      const w = (billingWindow().window ?? {}) as { onEvenPurchases?: (j: string) => void };
      w.onEvenPurchases?.(
        JSON.stringify([buy({ acknowledged: false, purchaseToken: "yeni-tok" })]),
      );
    },
    acknowledge: (t: string) => acked.push(t),
  };
  await withWindow(bridge, async () => {
    const r = await purchase("yearly");
    assert.deepEqual(launched, ["even_pro_yearly"]);
    assert.equal(r.ok, true);
    assert.equal(r.ok === true && r.entitlement.pro, true);
    // Onaylanmadıysa Play 3 gün sonra iade eder — akış onu onaylamalı.
    assert.deepEqual(acked, ["yeni-tok"]);
  });
});

test("native taraf PENDING döndürürse satın alma TAMAMLANMAMIŞ sayılır", async () => {
  const { purchase } = await import("./billing.ts");
  const bridge = {
    isReady: () => true,
    launchPurchase: () => {
      const w = (billingWindow().window ?? {}) as { onEvenPurchases?: (j: string) => void };
      w.onEvenPurchases?.(JSON.stringify([buy({ state: "pending" })]));
    },
  };
  await withWindow(bridge, async () => {
    const r = await purchase("monthly");
    assert.equal(r.ok, false);
    assert.equal(r.ok === false && r.reason, "not-completed");
  });
});

test("launchPurchase fırlatırsa PRO açılmaz", async () => {
  const { purchase } = await import("./billing.ts");
  const bridge = {
    isReady: () => true,
    launchPurchase: () => {
      throw new Error("Play açılamadı");
    },
  };
  await withWindow(bridge, async () => {
    const r = await purchase("monthly");
    assert.equal(r.ok, false);
  });
});

test("geri yükleme: köprü yoksa PRO yok", async () => {
  const { restoreEntitlement } = await import("./billing.ts");
  await withWindow(undefined, () => {
    assert.equal(restoreEntitlement(NOW).pro, false);
  });
});

/**
 * BU OLMADAN: kullanıcı telefonunu değiştirir, localStorage gider, ödediği
 * abonelik Play'de durur ama uygulamada PRO görünmez. Haklı olarak iade ister.
 */
test("geri yükleme cihazdaki satın almayı bulur ve onaylar", async () => {
  const { restoreEntitlement } = await import("./billing.ts");
  const acked: string[] = [];
  const bridge = {
    queryPurchases: () => JSON.stringify([buy({ acknowledged: false, purchaseToken: "eski-tok" })]),
    acknowledge: (t: string) => acked.push(t),
  };
  await withWindow(bridge, () => {
    const e = restoreEntitlement(NOW);
    assert.equal(e.pro, true);
    assert.deepEqual(acked, ["eski-tok"]);
  });
});

test("queryPurchases fırlatırsa PRO açılmaz", async () => {
  const { restoreEntitlement } = await import("./billing.ts");
  const bridge = {
    queryPurchases: () => {
      throw new Error("Play bağlantısı koptu");
    },
  };
  await withWindow(bridge, () => {
    assert.equal(restoreEntitlement(NOW).pro, false);
  });
});

test("acknowledge fırlatsa da geri yükleme çalışır", async () => {
  const { restoreEntitlement } = await import("./billing.ts");
  const bridge = {
    queryPurchases: () => JSON.stringify([buy({ acknowledged: false })]),
    acknowledge: () => {
      throw new Error("onay başarısız");
    },
  };
  await withWindow(bridge, () => {
    // Onay başarısız olsa bile satın alma geçerli: kullanıcı kilitlenmemeli.
    assert.equal(restoreEntitlement(NOW).pro, true);
  });
});
