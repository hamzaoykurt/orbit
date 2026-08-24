'use client';

import { useEffect, useState } from 'react';
import { Download } from 'lucide-react';

type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
};

export function InstallOrbit() {
  const [prompt, setPrompt] = useState<InstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(false);
  const [hint, setHint] = useState('');

  useEffect(() => {
    const onBeforeInstall = (event: Event) => { event.preventDefault(); setPrompt(event as InstallPromptEvent); };
    const onInstalled = () => { setInstalled(true); setPrompt(null); };
    window.addEventListener('beforeinstallprompt', onBeforeInstall);
    window.addEventListener('appinstalled', onInstalled);
    if (window.matchMedia('(display-mode: standalone)').matches) setInstalled(true);
    return () => { window.removeEventListener('beforeinstallprompt', onBeforeInstall); window.removeEventListener('appinstalled', onInstalled); };
  }, []);

  const install = async () => {
    if (prompt) {
      await prompt.prompt();
      const result = await prompt.userChoice;
      if (result.outcome === 'accepted') setInstalled(true);
      setPrompt(null);
      return;
    }
    setHint(/iPhone|iPad|iPod/.test(navigator.userAgent) ? 'Safari Paylaş menüsünden “Ana Ekrana Ekle”yi seç.' : 'Tarayıcı menüsünden “Uygulamayı yükle” veya “Ana ekrana ekle”yi seç.');
  };

  if (installed) return <p className="pwa-installed">Orbit uygulama olarak yüklü.</p>;
  return <div><button className="data-export pwa-install" onClick={() => void install()}><Download size={16}/><span><strong>Orbit’i uygulama olarak yükle</strong><small>Telefonunda bağımsız uygulama gibi aç</small></span></button>{hint && <p className="pwa-hint">{hint}</p>}</div>;
}
