# ProFitness bağlantısı

Fitness antrenman verisinin tek sahibidir. Orbit yalnız imzalı sunucu kanalından gelen haftalık özeti D1 içinde tutar; workout oluşturmaz, tamamlamaz veya geri almaz.

## Sunucu endpointleri

- `/api/integrations/profitness/connect` — Orbit oturumu ve açık onay gerektiren bağlantı girişi.
- `/api/integrations/profitness/sync` — bearer + timestamped HMAC doğrulamalı özet alıcısı.
- `/api/integrations/profitness/disconnect` — aynı çift sunucu doğrulamasıyla revocation.
- `/api/integrations/profitness/manage` — bağlı Orbit sahibine özel yönetim ekranı.
- `/api/integrations/profitness/status` — Rebuild ve Mentor Context için owner-scoped read layer.

Gerekli Worker secrets/variables: `ORBIT_PROFITNESS_SERVER_SECRET`, `ORBIT_PROFITNESS_REQUEST_SECRET`, `ORBIT_PROFITNESS_WEBHOOK_SECRET`, `ORBIT_PROFITNESS_CALLBACK_URL`, `ORBIT_PREMIUM_CAPABILITIES=fitness_sync`. Değerleri hiçbir zaman kaynak koduna veya istemci ortamına yazmayın.

Orbit içindeki **ProFitness'i aç** düğmesi `profitness://open` bağlantısını kullanır. Bu bağlantının Android tarafından uygulamaya yönlendirilebilmesi için ayrı ProFitness Android projesindeki `AndroidManifest.xml` dosyasına [`open-app.patch`](./open-app.patch) uygulanmalıdır.

## APK güncelleme

1. ProFitness Android deposunda yamayı uygulayın.
2. Aynı release imzasıyla yeni APK üretin.
3. Telefonda mevcut uygulamanın üzerine kurun; uygulamayı silmeyin. Böylece yerel veriler korunur.
4. Orbit'i yeniden açıp **ProFitness'i aç** düğmesine dokunun.

Orbit deposu APK üretmez; Android projesi, Android SDK ve imzalama anahtarı ProFitness deposunda kalır. Uygulama silinmişse Android verilerini geri getirmek mümkün olmayabilir.
