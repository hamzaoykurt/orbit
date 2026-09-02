export type ProgramDatePoint = { day: string; month: string };
export type ProgramDateRange = {
  start?: ProgramDatePoint;
  end?: ProgramDatePoint;
  year?: string;
  label: string;
};

type DateToken = { day: string; month?: string; year?: string };

const monthNames = [
  'OCA', 'ŞUB', 'MAR', 'NİS', 'MAY', 'HAZ',
  'TEM', 'AĞU', 'EYL', 'EKİ', 'KAS', 'ARA',
];

const monthAliases: Record<string, string> = {
  OCA: 'OCA', OCAK: 'OCA',
  SUB: 'ŞUB', SUBAT: 'ŞUB', ŞUB: 'ŞUB', ŞUBAT: 'ŞUB',
  MAR: 'MAR', MART: 'MAR',
  NIS: 'NİS', NISAN: 'NİS', NİS: 'NİS', NİSAN: 'NİS',
  MAY: 'MAY', MAYIS: 'MAY',
  HAZ: 'HAZ', HAZIRAN: 'HAZ',
  TEM: 'TEM', TEMMUZ: 'TEM',
  AGU: 'AĞU', AGUSTOS: 'AĞU', AĞU: 'AĞU', AĞUSTOS: 'AĞU',
  EYL: 'EYL', EYLUL: 'EYL', EYLÜL: 'EYL',
  EKI: 'EKİ', EKIM: 'EKİ', EKİ: 'EKİ', EKİM: 'EKİ',
  KAS: 'KAS', KASIM: 'KAS',
  ARA: 'ARA', ARALIK: 'ARA',
};

function normalizeMonth(value?: string) {
  if (!value) return undefined;
  const upper = value.trim().toLocaleUpperCase('tr-TR').replace(/[^A-ZÇĞİÖŞÜ]/g, '');
  return monthAliases[upper] ?? monthAliases[upper.slice(0, 3)];
}

function parseTokens(value: string): DateToken[] {
  const numeric = [...value.matchAll(/(?:^|\D)(\d{1,2})[./](\d{1,2})(?:[./](\d{4}))?/g)]
    .map((match) => ({ day: String(Number(match[1])), month: monthNames[Number(match[2]) - 1], year: match[3] }))
    .filter((token) => Number(token.day) >= 1 && Number(token.day) <= 31 && token.month);
  if (numeric.length) return numeric.slice(0, 2);

  return [...value.matchAll(/(?:^|[^\d])(\d{1,4})(?:\s+([A-Za-zÇĞİÖŞÜçğıöşü]{3,}))?(?:\s+(\d{4}))?/g)]
    .map((match) => ({ day: String(Number(match[1])), month: normalizeMonth(match[2]), year: match[3] }))
    .filter((token) => Number(token.day) >= 1 && Number(token.day) <= 31)
    .slice(0, 2);
}

/**
 * Turns loose, user-entered tour dates into two readable date points.
 * The title is used as context for ranges such as "25–14 Ara" + "25 Kasım".
 */
export function parseProgramDateRange(range: string, title = ''): ProgramDateRange {
  const label = range.trim() || 'Tarih belirtilmedi';
  const rangeTokens = parseTokens(label);
  const titleTokens = parseTokens(title);
  if (!rangeTokens.length) return { label };

  const contextualMonth = (token: DateToken, index: number) => {
    if (token.month) return token.month;
    if (titleTokens[index]?.day === token.day && titleTokens[index].month) return titleTokens[index].month;
    return titleTokens.find((candidate) => candidate.day === token.day && candidate.month)?.month;
  };

  let startMonth = contextualMonth(rangeTokens[0], 0);
  let endMonth = rangeTokens[1] ? contextualMonth(rangeTokens[1], 1) : undefined;
  if (!startMonth && endMonth) startMonth = endMonth;
  if (!endMonth && startMonth) endMonth = startMonth;

  const year = rangeTokens.find((token) => token.year)?.year ?? titleTokens.find((token) => token.year)?.year;
  const start = startMonth ? { day: rangeTokens[0].day, month: startMonth } : undefined;
  const end = rangeTokens[1] && endMonth ? { day: rangeTokens[1].day, month: endMonth } : undefined;
  return { start, end, year, label };
}
