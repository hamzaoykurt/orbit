import { FitnessLink } from '../rebuild/fitness-link';
export default function FitnessHelp() {
  return <main style={{maxWidth:560,margin:'10vh auto',padding:28,lineHeight:1.7}}>
    <p>ORBIT → PROFITNESS</p><h1>Telefondaki Fitness uygulamanı aç.</h1>
    <p>Bu bağlantı Android telefonundaki <strong>ProFitness</strong> APK’sı içindir. Bilgisayarda Fitness’i çalıştırmaz ve verilerini Orbit’e taşımaz.</p>
    <p>Uygulama açılmadıysa, <code>profitness://open</code> desteğini içeren APK güncellemesini yüklemelisin. Mevcut depo yalnızca şifre sıfırlama bağlantılarını tanıyor.</p>
    <p>Güncellemeyi aynı imzayla, mevcut uygulamanın üzerine kur. Verilerini korumak için uygulamayı kaldırma.</p>
    <FitnessLink/><p><a href="/">Orbit’e dön</a> · <a href="https://github.com/hamzaoykurt/profitnessapp" target="_blank" rel="noreferrer">ProFitness deposu</a></p>
  </main>;
}
