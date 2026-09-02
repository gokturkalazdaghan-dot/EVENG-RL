/**
 * reward_automation/cron.js
 *
 * Zamanlayıcı girişi. Her Pazartesi 00:00 UTC — cron: "0 0 * * 1"
 *
 * Kubernetes CronJob, systemd timer veya Celery beat ile aynı şekilde
 * çağrılır; bu dosya yalnızca giriş noktasıdır.
 *
 *   node reward_automation/cron.js
 */

const { distributeWeeklyRewards } = require('./rewardWorker');
const { createAppStoreClient, createPlayStoreClient } = require('./storeClients');

/**
 * Mağazaya göre doğru istemciyi seçen yönlendirici.
 *
 * `issueRewardCode` mağazadan bağımsızdır; hangi API'nin çağrılacağına
 * burada karar verilir.
 */
function createStoreRouter() {
  const appStore = createAppStoreClient();
  const playStore = createPlayStoreClient({
    accessTokenProvider: async () => process.env.PLAY_ACCESS_TOKEN ?? '',
  });

  return {
    async createOfferCode(input) {
      // offerId biçimi mağazayı belirler (App Store alt çizgi, Play tire).
      const client = input.offerId.includes('_') ? appStore : playStore;
      return client.createOfferCode(input);
    },
  };
}

/**
 * Kullanıcının mağaza bilgisi — VERİTABANINDAN.
 *
 * Buradaki üç fonksiyon `console.log` yazan yer tutuculardı ve gerçek
 * sonuçları ölçüldüğünde şuydu:
 *
 *   - `loadAccount` her kullanıcıyı 'APP_STORE' sayıyordu: Play kullanıcısı
 *     kullanamayacağı bir App Store teklif kodu alıyordu.
 *   - `recordAward` hiçbir şey yazmıyordu: ödül `reward_awards` tablosuna
 *     girmediği için `/v1/rewards/pending` HER ZAMAN boş dönüyordu ve
 *     kazanan kullanıcı ödülünü UYGULAMADA HİÇ GÖREMİYORDU. Mağazada kod
 *     üretiliyor, kimseye ulaşmıyordu.
 *
 * Yani ödül motoru uçtan uca dekoratifti.
 */
async function loadAccount(userId) {
  const { getRepositories } = require('../persistence/registry');
  const account = await getRepositories().loadAccount(userId);

  // Hesap bulunamazsa mağaza UYDURULMAZ. `storeForUser` bilinmeyen mağaza
  // için kod üretmeyi reddeder; varsayılan seçmek, kullanıcının
  // kullanamayacağı bir kod üretmek demektir.
  return {
    store: account?.store ?? null,
    // Push jetonu istemci tarafında HENÜZ ÜRETİLMİYOR (bkz.
    // docs/DEPLOYMENT.md). Ödül teslimatı buna bağlı değil: kayıt
    // veritabanına girer ve uygulama açılışta gösterir.
    pushToken: null,
  };
}

/** Denetim kaydı — kodun KENDİSİ saklanmaz, yalnızca parmak izi. */
async function recordAward(award) {
  const { getRepositories } = require('../persistence/registry');
  await getRepositories().recordAward(award);
  console.log(
    `[Rewards] AWARD -> week=${award.week} rank=${award.rank} days=${award.days} ` +
      `store=${award.store} fp=${award.codeFingerprint}`,
  );
}

/**
 * Redis istemcisi.
 *
 * `ioredis` doğrudan `require` ediliyordu ama bağımlılık listesinde YOK:
 * `node reward_automation/cron.js` çalıştıran biri anlaşılmaz bir
 * MODULE_NOT_FOUND yığını görüyordu. Artık ne yapması gerektiğini söyleyen
 * bir hata alıyor.
 */
function openRedis() {
  let Redis;
  try {
    Redis = require('ioredis');
  } catch {
    throw new Error(
      'ioredis kurulu değil. Haftalık sıralama Redis üzerinde tutuluyor:\n' +
        '  npm install ioredis\n' +
        '  REDIS_URL=redis://… node reward_automation/cron.js',
    );
  }
  return new Redis(process.env.REDIS_URL ?? 'redis://127.0.0.1:6379');
}

async function main() {
  const { openDatabase } = require('../persistence');
  const { setRepositories } = require('../persistence/registry');
  const { createPushSenderFromEnv } = require('./pushSender');

  // Veritabanı ZORUNLU: ödül kaydı olmadan kod üretmek, kimseye
  // ulaşmayacak kodlar üretmektir.
  setRepositories(await openDatabase(process.env.DATABASE_URL));

  const push = createPushSenderFromEnv();
  if (!push.configured) {
    console.warn(
      '[Rewards] PUSH_GATEWAY_URL tanımsız — bildirim gönderilmeyecek.\n' +
        '  Ödüller yine de kaydedilir ve kullanıcı uygulamayı açtığında görür.',
    );
  }

  const redis = openRedis();

  try {
    const result = await distributeWeeklyRewards(redis, {
      storeClient: createStoreRouter(),
      loadAccount,
      sendPush: push.sendPush,
      recordAward,
    });
    console.log('[Rewards] Sonuç:', JSON.stringify(result));

    // Kısmi hata da sıfırdan farklı çıkışla bildirilir: zamanlayıcı yeniden
    // dener ve kullanıcı başına işaret sayesinde tekrar güvenlidir.
    process.exitCode = result.failures > 0 ? 1 : 0;
  } catch (err) {
    console.error('[Rewards] Dağıtım başarısız:', err);
    process.exitCode = 1;
  } finally {
    redis.disconnect();
  }
}

if (require.main === module) {
  void main();
}

// `sendPush` artık burada tanımlı değil: ortamdan kurulan bir gönderici
// (pushSender.js) enjekte ediliyor.
module.exports = { createStoreRouter, loadAccount, recordAward, openRedis, main };
