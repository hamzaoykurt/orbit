# Teslim: ikon/logo Gün Işığı teması, v8 (dal fix/ikon-logo-tema)
DURUM: TAMAM (v7 recolor yerine baştan vektör)
- Kaynak: scripts/build-icons.mjs (tek SVG şablonu, `node scripts/build-icons.mjs a|b|c`; `--variants` yan yana sayfa). Geometri: 2 dik elips, 4 kesişim, üst-alt dokuma = eski düğümün formu.
- Varyantlar: .ekip/ekran/ikon/varyant-{a,b,c}.png, hepsi: varyantlar.png. A: 4 halka 4 renk (mercan/mor/güneş/zümrüt), krem kabarık tile. B: gökkuşağı şerit, koyu ink tile. C: renkli düğüm, mercan→mor tile.
- SEÇİLEN: A. Neden: krem sayfaya doğal oturuyor, temanın 4 rengini taşıyor, 48 px'te 4 renk net okunuyor; B koyu tile açık temada yabancı, C'de krem halka tile'a karışıyor.
- Üretilen (v8): orbit-icon-v8-{master,192,512}, orbit-favicon-v8, orbit-apple-touch-v8, orbit-mark-v8-96; ayrıca icon-maskable-192/512 (tam dolgu, düğüm %90 ölçek, güvenli alan içinde), icon-192/512, apple-touch-icon, favicon.png/.svg, shortcuts/*-96, splash 1170x2532 + 1290x2796 (zemin #F5EADA).
- Kod: app/orbit-mark.tsx, app/layout.tsx (v8, manifest ?v=11), manifest.webmanifest (v8; #F5EADA doğrulandı), auth/login-page.ts (favicon.png).
- Önce/sonra: .ekip/ekran/ikon/onceki-sonraki.png (v6 | v8 any | maskable | 96/48 px | shortcuts | splash).
- Açık: og.png ve eski v2-v7 dosyaları dokunulmadı; splash'ta tile krem-üstü-krem (kenar gölgeyle ayrışır); canlı tarayıcıda görsel kontrol yapılmadı. Renk değişimi: VARIANTS içindeki hex'leri düzenle, scripti çalıştır.
