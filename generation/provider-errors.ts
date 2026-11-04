// One place that turns an AI provider failure into a bounded diagnostic code and a Turkish message that says
// what is actually wrong. Used by every route that calls the model layer, so the app never shows a generic
// "unavailable" (or a misleading "check the model") for a problem the user or the owner can fix.
const KNOWN = /^provider-(http-\d{3}|config-invalid|not-configured|incomplete|empty|refusal|too-large|malformed|truncated|key-invalid|service-disabled)$/;

export function providerFailureCode(error: unknown): string {
  const message = error instanceof Error ? error.message : '';
  const mapped: Record<string, string> = { 'provider-http-429': 'provider-quota', 'provider-http-401': 'provider-key', 'provider-http-403': 'provider-key', 'provider-http-404': 'provider-model' };
  if (mapped[message]) return mapped[message];
  if (/^provider-http-5\d\d$/.test(message)) return 'provider-upstream';
  return KNOWN.test(message) ? message : 'provider-runtime';
}

const MESSAGES: Record<string, string> = {
  'provider-quota': 'AI sağlayıcısının kullanım sınırına ulaşıldı. Kota yenilenince tekrar dene. Başka veya ücretli bir sağlayıcıya geçilmedi.',
  'provider-key': 'AI anahtarı geçersiz veya bu modele erişimi yok. Sunucudaki sağlayıcı anahtarını kontrol et.',
  'provider-key-invalid': 'Gemini anahtarı geçersiz ya da süresi dolmuş. Google AI Studio’dan yeni anahtar alıp sunucudaki GEMINI_API_KEY gizli değişkenini güncelle.',
  'provider-service-disabled': 'Bu anahtarın Google projesinde Generative Language API kapalı. Google Cloud Console’da API’yi etkinleştir.',
  'provider-model': 'Seçilen AI modeli bulunamadı. Sunucudaki GEMINI_MODEL ayarını sil (model otomatik seçilir) ya da geçerli bir model adı yaz.',
  'provider-http-400': 'AI sağlayıcısı isteği kabul etmedi (400). Model adı geçersiz olabilir; özel verilerin gönderilmedi.',
  'provider-upstream': 'AI sağlayıcısı şu an yanıt vermiyor (sağlayıcı tarafında hata). Biraz sonra tekrar dene.',
  'provider-truncated': 'AI yanıtı yarıda kesildi. Tekrar dene.',
  'provider-refusal': 'AI bu isteği yanıtlamadı (güvenlik filtresi). Tekrar dene.',
  'provider-incomplete': 'AI geçerli bir yanıt üretemedi. Tekrar dene; özel verilerin gönderilmedi.',
  'provider-empty': 'AI geçerli bir yanıt üretemedi. Tekrar dene; özel verilerin gönderilmedi.',
  'provider-too-large': 'AI beklenenden uzun bir yanıt verdi. Tekrar dene.',
  'provider-malformed': 'AI geçerli JSON döndürmedi. Tekrar dene; özel verilerin gönderilmedi.',
  'provider-config-invalid': 'AI sağlayıcı ayarı geçersiz. AI_PROVIDER yalnız gemini veya openai olabilir; model adı gemini- ile başlamalı.',
  'provider-not-configured': 'Gemini anahtarı sunucuya ulaşmıyor. Cloudflare ortamında GEMINI_API_KEY gizli değişkenini kontrol et.',
  'provider-runtime': 'AI sağlayıcısına ulaşılamadı veya yanıt zaman aşımına uğradı. Tekrar dene.',
};

export const providerFailureMessage = (code: string) => MESSAGES[code];
export const providerFailureStatus = (code: string) => (code === 'provider-quota' ? 429 : 503);
