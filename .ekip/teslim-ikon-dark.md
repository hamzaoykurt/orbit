# Teslim: koyu ikon (dal feat/ikon-dark)
- Kaynak: scripts/build-icons.mjs, yeni 'dark' varyantı (a'ya dokunulmadı). `node scripts/build-icons.mjs dark`.
- Tile #17151C→#08070B (nötr siyah), ince nötr kenar, halkalar #FF6A4D #9F82FF #FFC62E #22D49B; splash zemini #0B0A0F.
- public/: orbit-icon-dark-v8-192/512, orbit-favicon-dark-v8, orbit-apple-touch-dark-v8, orbit-mark-dark-v8-96, icon-maskable-dark-v8-192/512, splash/apple-splash-dark-{1170x2532,1290x2796} (zemin #1B1035).
- Bağlama: manifest dokunulmadı (ana ikon açık A); app/layout.tsx'e prefers-color-scheme: dark için koyu favicon <link>; auth/gate.ts PUBLIC_FILES'a 9 yeni yol.
- Önizleme: .ekip/ekran/ikon/dark-onceki-sonraki.png (açık | koyu, 96/48 px).
- Koyuyu ana ikon yapmak için: manifest + layout icons + orbit-mark'taki dosya adlarını -dark- olanlarla değiştir.
- Açık: canlı tarayıcıda dark favicon denenmedi.
