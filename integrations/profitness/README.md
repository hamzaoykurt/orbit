# ProFitness bağlantısı

Orbit içindeki **ProFitness'i aç** düğmesi `profitness://open` bağlantısını kullanır. Bu bağlantının Android tarafından uygulamaya yönlendirilebilmesi için ayrı ProFitness Android projesindeki `AndroidManifest.xml` dosyasına [`open-app.patch`](./open-app.patch) uygulanmalıdır.

## APK güncelleme

1. ProFitness Android deposunda yamayı uygulayın.
2. Aynı release imzasıyla yeni APK üretin.
3. Telefonda mevcut uygulamanın üzerine kurun; uygulamayı silmeyin. Böylece yerel veriler korunur.
4. Orbit'i yeniden açıp **ProFitness'i aç** düğmesine dokunun.

Orbit deposu APK üretmez; Android projesi, Android SDK ve imzalama anahtarı ProFitness deposunda kalır. Uygulama silinmişse Android verilerini geri getirmek mümkün olmayabilir.

