// Islam learning curriculum: STRUCTURE only. Every ayah and hadith is referenced by number and read from its source
// (learn/quran-source.ts, learn/hadith-source.ts) at request time. Nothing here is a quotation or a ruling.
// Each referenced ayah/hadith was read from the source and checked against its lesson title when this file was written.
import { parseVerseRef } from './quran-source';
import { parseHadithRef } from './hadith-source';

export type Lesson = {
  id: string; title: string; goal: string;
  /** Key terms the lesson is about. They steer the AI explanation and quiz; they are not teaching content. */
  focus: string[];
  /** Ayah references ("2:255", "112:1-4"). */
  verses: string[];
  /** Hadith references ("nawawi:3"). */
  hadiths: string[];
  /** Ayet-ezber lessons: the client offers the hide-the-words drill. */
  memorize?: boolean;
};
export type Topic = { id: string; title: string; summary: string; lessons: Lesson[] };
export type Section = { id: 'ibadet' | 'kuran' | 'ayet' | 'hadis'; title: string; summary: string; topics: Topic[] };

export const CURRICULUM_NOTICE = 'Ayet ve hadis metinleri güvenilir bir kaynaktan çekilir; yapay zekâ onları yazmaz. "Açıklama" etiketli bölümler yapay zekâ tarafından, bu metinlere dayanarak hazırlanır; ayet ya da hadis değildir ve fetva yerine geçmez. Dinî hüküm için ilmihale veya bir âlime danış.';

const lesson = (id: string, title: string, goal: string, focus: string[], verses: string[], hadiths: string[] = [], memorize = false): Lesson => ({ id, title, goal, focus, verses, hadiths, ...(memorize ? { memorize } : {}) });

// Kırk Hadis themes (title written by us from the fetched text; the text itself always comes from the source).
const FORTY: Record<number, string> = {
  1: 'Ameller niyetlere göredir', 2: 'Cibril hadisi: İslam, iman, ihsan', 3: 'İslam beş esas üzerine kuruludur', 4: 'Yaratılış ve kader', 5: 'Dinde sonradan çıkarılan işler',
  6: 'Helal, haram ve şüpheli şeyler', 7: 'Din samimiyettir', 8: 'Can ve malın dokunulmazlığı', 9: 'Emir ve yasaklarda gücün yettiğince', 10: 'Helal kazanç ve duanın kabulü',
  11: 'Şüphe vereni bırak', 12: 'Gereksiz işleri terk etmek', 13: 'Kendin için istediğini kardeşin için de iste', 14: 'Müslümanın kanının dokunulmazlığı', 15: 'Güzel söz, komşu ve misafir hakkı',
  16: 'Öfkelenme', 17: 'Her işte ihsan', 18: 'Takva ve güzel ahlak', 19: 'Allah\'ı gözet, seni gözetsin', 20: 'Hayâ', 21: 'İman et ve dosdoğru ol', 22: 'Farzlar ve helal–haram sınırı',
  23: 'Temizlik imanın yarısıdır', 24: 'Zulmün yasaklanması', 25: 'Her tesbih, her iyilik sadakadır', 26: 'Her eklem için sadaka', 27: 'İyilik güzel ahlaktır', 28: 'Sünnete ve itaate sarılmak',
  29: 'Cennete götüren ameller', 30: 'Allah\'ın koyduğu sınırlar', 31: 'Dünyaya karşı zühd', 32: 'Zarar vermek de zarara zararla karşılık vermek de yok', 33: 'Dava ve ispat', 34: 'Kötülüğü değiştirmek',
  35: 'Müslümanlar kardeştir', 36: 'Müslümana yardım ve ilim yolu', 37: 'İyilik ve kötülüğün yazılması', 38: 'Allah\'ın dostluğu ve nafile ibadetler', 39: 'Hata, unutma ve zorlanma', 40: 'Dünyada bir garip ya da yolcu gibi ol',
  41: 'Arzuyu Peygamberin getirdiğine uydurmak', 42: 'Allah\'ın affı',
};
const FORTY_GROUPS: [string, string, number[]][] = [
  ['iman-islam', 'İman ve İslam\'ın temelleri', [1, 2, 3, 4, 21, 22]],
  ['olcu', 'Dinde ölçü ve helal–haram', [5, 6, 7, 10, 11, 12, 28, 30, 41]],
  ['ahlak', 'Kardeşlik ve güzel ahlak', [13, 15, 16, 17, 18, 20, 27, 32, 34, 35, 36]],
  ['haklar', 'Haklar ve adalet', [8, 14, 24, 33]],
  ['kulluk', 'Kulluk ve manevi yaşam', [9, 19, 23, 25, 26, 29, 31, 37, 38, 39, 40, 42]],
];

export const CURRICULUM: Section[] = [
  {
    id: 'ibadet', title: 'İbadetler', summary: 'Namaz, abdest, oruç, zekât ve hac: ne, neden ve nasıl; her ders ilgili ayet ve hadislerle.',
    topics: [
      { id: 'namaz', title: 'Namaz', summary: 'Namazın anlamı, temel hareketleri ve vakitleri.', lessons: [
        lesson('namaz-neden', 'Namaz neden kılınır?', 'Namazın Allah\'ı anmakla ve kulluk bilinciyle ilişkisini ayetlerden okumak.', ['Allah\'ı anmak', 'kulluk', 'kötülükten alıkoymak'], ['20:14', '29:45'], ['nawawi:3']),
        lesson('namaz-rukun', 'Namazın temel hareketleri ve anlamı', 'Kıyam, rükû ve secdenin ne anlama geldiğini ilgili ayetlerle birlikte öğrenmek.', ['kıyam', 'rükû', 'secde', 'kıraat'], ['2:43', '22:77']),
        lesson('namaz-vakit', 'Namaz vakitleri', 'Namazın belirli vakitlere bağlı olduğunu ayetlerden görmek.', ['vakit', 'sabah', 'gün batımı', 'gece'], ['4:103', '17:78', '11:114']),
      ] },
      { id: 'abdest', title: 'Abdest ve temizlik', summary: 'Abdestin dayandığı ayet ve temizliğin imandaki yeri.', lessons: [
        lesson('abdest-nedir', 'Abdest: ne zaman, neleri yıkarız?', 'Abdestin Kur\'an\'daki dayanağını ve temel uzuvlarını okumak.', ['abdest', 'yüz', 'eller', 'baş', 'ayaklar'], ['5:6'], ['nawawi:23']),
        lesson('abdest-temizlik', 'Temizlik ve arınma', 'Arınmanın hem bedeni hem manevi yönünü ayet ve hadisle düşünmek.', ['temizlik', 'arınma'], ['9:108'], ['nawawi:23']),
      ] },
      { id: 'oruc', title: 'Oruç', summary: 'Orucun amacı ve vakti.', lessons: [
        lesson('oruc-neden', 'Oruç neden tutulur?', 'Orucun farz kılınışını, Ramazan ayını ve amacını ayetlerden okumak.', ['oruç', 'Ramazan', 'takva', 'Kur\'an\'ın indirilişi'], ['2:183', '2:185'], ['nawawi:3', 'nawawi:22']),
        lesson('oruc-vakit', 'Orucun vakti', 'Orucun hangi vakitler arasında tutulduğunu ayetten okumak.', ['sahur', 'imsak', 'akşam', 'vakit'], ['2:187']),
      ] },
      { id: 'zekat', title: 'Zekât', summary: 'Zekâtın anlamı ve verileceği yerler.', lessons: [
        lesson('zekat-neden', 'Zekât neden verilir?', 'Zekâtın malı arındırma ve paylaşma yönünü ayet ve hadislerle anlamak.', ['zekât', 'arınma', 'paylaşma', 'sadaka'], ['9:103', '2:43'], ['nawawi:3', 'nawawi:25']),
        lesson('zekat-kimlere', 'Zekât kimlere verilir?', 'Ayette sayılan zekât alanlarını tanımak.', ['yoksullar', 'düşkünler', 'borçlular', 'yolda kalanlar'], ['9:60']),
      ] },
      { id: 'hac', title: 'Hac', summary: 'Haccın farz oluşu ve çağrısı.', lessons: [
        lesson('hac-neden', 'Hac kimlere farzdır?', 'Haccın Kâbe ile ve gücü yetmekle ilişkisini ayetten okumak.', ['Kâbe', 'hac', 'gücü yetmek'], ['3:97'], ['nawawi:3']),
        lesson('hac-cagri', 'Haccın çağrısı ve tamamlanması', 'Hac çağrısını ve haccı Allah için tamamlamayı ayetlerden okumak.', ['çağrı', 'tamamlamak', 'umre'], ['22:27', '2:196']),
      ] },
    ],
  },
  {
    id: 'kuran', title: 'Kur\'an\'ı anlama', summary: 'Kur\'an\'ı düşünerek okumak ve kısa sûreleri ayet ayet anlamak.',
    topics: [
      { id: 'kuran-giris', title: 'Kur\'an\'ı düşünerek okumak', summary: 'Kur\'an\'ın kendi çağrısı: düşünmek ve öğüt almak.', lessons: [
        lesson('kuran-dusun', 'Düşünmek, öğüt almak, kolaylık', 'Kur\'an\'ın düşünmeye ve öğüt almaya çağıran ayetlerini okumak.', ['tefekkür', 'öğüt', 'kolaylık'], ['4:82', '38:29', '54:17']),
      ] },
      { id: 'fatiha', title: 'Fâtiha Sûresi', summary: 'Her namazda okunan sûreyi anlamak.', lessons: [
        lesson('fatiha-anla', 'Fâtiha\'yı anlamak', 'Fâtiha\'nın yedi ayetini ve ana temalarını (hamd, rahmet, kulluk, doğru yol) anlamak.', ['hamd', 'rahmet', 'kulluk', 'doğru yol'], ['1:1-7']),
      ] },
      { id: 'kisa-sureler', title: 'Kısa sûreleri anlamak', summary: 'Sık okunan kısa sûreler ve ana mesajları.', lessons: [
        lesson('ihlas-anla', 'İhlâs Sûresi', 'Allah\'ın birliği konusunu dört ayetten okumak.', ['tevhid', 'Allah\'ın birliği'], ['112:1-4']),
        lesson('asr-anla', 'Asr Sûresi', 'Zaman, iman, salih amel, hakkı ve sabrı tavsiye temalarını anlamak.', ['zaman', 'iman', 'sabır', 'hakkı tavsiye'], ['103:1-3']),
        lesson('kevser-anla', 'Kevser Sûresi', 'Üç ayetin anlamını okumak.', ['nimet', 'namaz', 'kurban'], ['108:1-3']),
        lesson('felak-nas-anla', 'Felak ve Nâs Sûreleri', 'Sığınma temasını iki sûrede okumak.', ['sığınmak', 'şer', 'vesvese'], ['113:1-5', '114:1-6']),
      ] },
      { id: 'kursi', title: 'Âyetü\'l-Kürsî', summary: 'Bakara 255. ayetin anlamı.', lessons: [
        lesson('kursi-anla', 'Âyetü\'l-Kürsî\'yi anlamak', 'Ayetin Allah hakkında söylediklerini cümle cümle okumak.', ['diri', 'her şeyi gözeten', 'ilim', 'hükümranlık'], ['2:255']),
      ] },
    ],
  },
  {
    id: 'ayet', title: 'Ayet öğrenme', summary: 'Anlamını oku, Arapçasını parça parça gizleyerek ezberle.',
    topics: [
      { id: 'ezber-listesi', title: 'Ezber listesi', summary: 'Kısa sûreler ve sık okunan ayetler.', lessons: [
        lesson('ezber-fatiha', 'Fâtiha', 'Meali okuyup Arapçasını ezberlemek.', ['Fâtiha'], ['1:1-7'], [], true),
        lesson('ezber-ihlas', 'İhlâs', 'Meali okuyup Arapçasını ezberlemek.', ['İhlâs'], ['112:1-4'], [], true),
        lesson('ezber-felak', 'Felak', 'Meali okuyup Arapçasını ezberlemek.', ['Felak'], ['113:1-5'], [], true),
        lesson('ezber-nas', 'Nâs', 'Meali okuyup Arapçasını ezberlemek.', ['Nâs'], ['114:1-6'], [], true),
        lesson('ezber-asr', 'Asr', 'Meali okuyup Arapçasını ezberlemek.', ['Asr'], ['103:1-3'], [], true),
        lesson('ezber-kevser', 'Kevser', 'Meali okuyup Arapçasını ezberlemek.', ['Kevser'], ['108:1-3'], [], true),
        lesson('ezber-kafirun', 'Kâfirûn', 'Meali okuyup Arapçasını ezberlemek.', ['Kâfirûn'], ['109:1-6'], [], true),
        lesson('ezber-nasr', 'Nasr', 'Meali okuyup Arapçasını ezberlemek.', ['Nasr'], ['110:1-3'], [], true),
        lesson('ezber-kursi', 'Âyetü\'l-Kürsî', 'Meali okuyup Arapçasını ezberlemek.', ['Âyetü\'l-Kürsî'], ['2:255'], [], true),
        lesson('ezber-bakara-son', 'Bakara sûresinin son iki ayeti', 'Meali okuyup Arapçasını ezberlemek.', ['Bakara 285-286'], ['2:285-286'], [], true),
      ] },
    ],
  },
  {
    id: 'hadis', title: 'Hadisler', summary: 'İmam Nevevî\'nin Kırk Hadis\'i (el-Erbaûn): metin ve kaynak kaydı kaynağından gelir.',
    topics: FORTY_GROUPS.map(([id, title, numbers]) => ({
      id: `hadis-${id}`, title, summary: `${numbers.length} hadis`,
      lessons: numbers.map(number => lesson(`hadis-${number}`, FORTY[number], 'Hadisi oku, anlamını kendi cümlenle söyle.', [FORTY[number]], [], [`nawawi:${number}`])),
    })),
  },
];

export const LESSONS = new Map<string, Lesson>(CURRICULUM.flatMap(section => section.topics.flatMap(topic => topic.lessons.map(item => [item.id, item] as const))));
export const findLesson = (id: unknown) => typeof id === 'string' ? LESSONS.get(id) : undefined;
export const lessonRefsAreValid = (item: Lesson) => item.verses.every(ref => parseVerseRef(ref)) && item.hadiths.every(ref => parseHadithRef(ref));
