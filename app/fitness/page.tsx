import Link from 'next/link';
import { FitnessLink } from '../rebuild/fitness-link';
export default function FitnessHelp() {
  return <main className="fitness-help"><div className="fitness-help-card">
    <p className="eyebrow">ORBIT → PROFITNESS</p><h1>Telefondaki Fitness uygulamanı aç.</h1>
    <p>Bu bağlantı Android telefonundaki <strong>ProFitness</strong> APK’sı içindir. Bilgisayarda Fitness’i çalıştırmaz; veri aktarımı yalnız ayrıca onayladığın Premium Fitness Sync bağlantısıyla yapılır.</p>
    <p>Uygulama açılmadıysa, <code>profitness://open</code> desteğini içeren güncel APK’yı yüklemelisin.</p>
    <p>Güncellemeyi aynı imzayla, mevcut uygulamanın üzerine kur. Verilerini korumak için uygulamayı kaldırma.</p>
    <FitnessLink/><p><Link href="/">Orbit’e dön</Link> · <a href="https://github.com/hamzaoykurt/profitnessapp" target="_blank" rel="noreferrer">ProFitness deposu</a></p>
  </div></main>;
}
