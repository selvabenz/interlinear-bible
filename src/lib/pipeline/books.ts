import type { Testament } from './types';

/** The 66-book Protestant canon in order: USFM code, English name, Tamil (IRV) name, chapters. */
const RAW: [string, string, string, number][] = [
  ['GEN', 'Genesis', 'ஆதியாகமம்', 50], ['EXO', 'Exodus', 'யாத்திராகமம்', 40], ['LEV', 'Leviticus', 'லேவியராகமம்', 27],
  ['NUM', 'Numbers', 'எண்ணாகமம்', 36], ['DEU', 'Deuteronomy', 'உபாகமம்', 34], ['JOS', 'Joshua', 'யோசுவா', 24],
  ['JDG', 'Judges', 'நியாயாதிபதிகள்', 21], ['RUT', 'Ruth', 'ரூத்', 4], ['1SA', '1 Samuel', '1 சாமுவேல்', 31],
  ['2SA', '2 Samuel', '2 சாமுவேல்', 24], ['1KI', '1 Kings', '1 இராஜாக்கள்', 22], ['2KI', '2 Kings', '2 இராஜாக்கள்', 25],
  ['1CH', '1 Chronicles', '1 நாளாகமம்', 29], ['2CH', '2 Chronicles', '2 நாளாகமம்', 36], ['EZR', 'Ezra', 'எஸ்றா', 10],
  ['NEH', 'Nehemiah', 'நெகேமியா', 13], ['EST', 'Esther', 'எஸ்தர்', 10], ['JOB', 'Job', 'யோபு', 42],
  ['PSA', 'Psalms', 'சங்கீதம்', 150], ['PRO', 'Proverbs', 'நீதிமொழிகள்', 31], ['ECC', 'Ecclesiastes', 'பிரசங்கி', 12],
  ['SNG', 'Song of Songs', 'உன்னதப்பாட்டு', 8], ['ISA', 'Isaiah', 'ஏசாயா', 66], ['JER', 'Jeremiah', 'எரேமியா', 52],
  ['LAM', 'Lamentations', 'புலம்பல்', 5], ['EZK', 'Ezekiel', 'எசேக்கியேல்', 48], ['DAN', 'Daniel', 'தானியேல்', 12],
  ['HOS', 'Hosea', 'ஓசியா', 14], ['JOL', 'Joel', 'யோவேல்', 3], ['AMO', 'Amos', 'ஆமோஸ்', 9],
  ['OBA', 'Obadiah', 'ஒபதியா', 1], ['JON', 'Jonah', 'யோனா', 4], ['MIC', 'Micah', 'மீகா', 7],
  ['NAM', 'Nahum', 'நாகூம்', 3], ['HAB', 'Habakkuk', 'ஆபகூக்', 3], ['ZEP', 'Zephaniah', 'செப்பனியா', 3],
  ['HAG', 'Haggai', 'ஆகாய்', 2], ['ZEC', 'Zechariah', 'சகரியா', 14], ['MAL', 'Malachi', 'மல்கியா', 4],
  ['MAT', 'Matthew', 'மத்தேயு', 28], ['MRK', 'Mark', 'மாற்கு', 16], ['LUK', 'Luke', 'லூக்கா', 24],
  ['JHN', 'John', 'யோவான்', 21], ['ACT', 'Acts', 'அப்போஸ்தலருடைய நடபடிகள்', 28], ['ROM', 'Romans', 'ரோமர்', 16],
  ['1CO', '1 Corinthians', '1 கொரிந்தியர்', 16], ['2CO', '2 Corinthians', '2 கொரிந்தியர்', 13], ['GAL', 'Galatians', 'கலாத்தியர்', 6],
  ['EPH', 'Ephesians', 'எபேசியர்', 6], ['PHP', 'Philippians', 'பிலிப்பியர்', 4], ['COL', 'Colossians', 'கொலோசெயர்', 4],
  ['1TH', '1 Thessalonians', '1 தெசலோனிக்கேயர்', 5], ['2TH', '2 Thessalonians', '2 தெசலோனிக்கேயர்', 3],
  ['1TI', '1 Timothy', '1 தீமோத்தேயு', 6], ['2TI', '2 Timothy', '2 தீமோத்தேயு', 4], ['TIT', 'Titus', 'தீத்து', 3],
  ['PHM', 'Philemon', 'பிலேமோன்', 1], ['HEB', 'Hebrews', 'எபிரெயர்', 13], ['JAS', 'James', 'யாக்கோபு', 5],
  ['1PE', '1 Peter', '1 பேதுரு', 5], ['2PE', '2 Peter', '2 பேதுரு', 3], ['1JN', '1 John', '1 யோவான்', 5],
  ['2JN', '2 John', '2 யோவான்', 1], ['3JN', '3 John', '3 யோவான்', 1], ['JUD', 'Jude', 'யூதா', 1],
  ['REV', 'Revelation', 'வெளிப்படுத்தின விசேஷம்', 22]
];

export interface BookInfo {
  id: string;
  en: string;
  ta: string;
  chapters: number;
  order: number;
  testament: Testament;
}

export const BOOKS: BookInfo[] = RAW.map(([id, en, ta, chapters], k) => ({
  id, en, ta, chapters, order: k + 1, testament: k < 39 ? 'OT' : 'NT'
}));

const BY_ID = new Map(BOOKS.map((b) => [b.id, b]));

/** STEPBible / OSIS style abbreviations that appear in source-token keys ("Phm.1.1"). */
const ALIASES: Record<string, string> = {
  GEN: 'GEN', EXO: 'EXO', EXOD: 'EXO', LEV: 'LEV', NUM: 'NUM', DEU: 'DEU', DEUT: 'DEU', JOS: 'JOS', JOSH: 'JOS',
  JDG: 'JDG', JUDG: 'JDG', RUT: 'RUT', RUTH: 'RUT', '1SA': '1SA', '1SAM': '1SA', '2SA': '2SA', '2SAM': '2SA',
  '1KI': '1KI', '1KGS': '1KI', '2KI': '2KI', '2KGS': '2KI', '1CH': '1CH', '1CHR': '1CH', '2CH': '2CH', '2CHR': '2CH',
  EZR: 'EZR', EZRA: 'EZR', NEH: 'NEH', EST: 'EST', ESTH: 'EST', JOB: 'JOB', PSA: 'PSA', PS: 'PSA', PRO: 'PRO', PROV: 'PRO',
  ECC: 'ECC', ECCL: 'ECC', SNG: 'SNG', SONG: 'SNG', ISA: 'ISA', JER: 'JER', LAM: 'LAM', EZK: 'EZK', EZEK: 'EZK',
  DAN: 'DAN', HOS: 'HOS', JOL: 'JOL', JOEL: 'JOL', AMO: 'AMO', AMOS: 'AMO', OBA: 'OBA', OBAD: 'OBA', JON: 'JON', JONAH: 'JON',
  MIC: 'MIC', NAM: 'NAM', NAH: 'NAM', HAB: 'HAB', ZEP: 'ZEP', ZEPH: 'ZEP', HAG: 'HAG', ZEC: 'ZEC', ZECH: 'ZEC', MAL: 'MAL',
  MAT: 'MAT', MATT: 'MAT', MRK: 'MRK', MARK: 'MRK', LUK: 'LUK', LUKE: 'LUK', JHN: 'JHN', JOHN: 'JHN', ACT: 'ACT', ACTS: 'ACT',
  ROM: 'ROM', '1CO': '1CO', '1COR': '1CO', '2CO': '2CO', '2COR': '2CO', GAL: 'GAL', EPH: 'EPH', PHP: 'PHP', PHIL: 'PHP',
  COL: 'COL', '1TH': '1TH', '1THESS': '1TH', '2TH': '2TH', '2THESS': '2TH', '1TI': '1TI', '1TIM': '1TI', '2TI': '2TI', '2TIM': '2TI',
  TIT: 'TIT', TITUS: 'TIT', PHM: 'PHM', PHLM: 'PHM', HEB: 'HEB', JAS: 'JAS', JAS_: 'JAS', '1PE': '1PE', '1PET': '1PE',
  '2PE': '2PE', '2PET': '2PE', '1JN': '1JN', '1JOHN': '1JN', '2JN': '2JN', '2JOHN': '2JN', '3JN': '3JN', '3JOHN': '3JN',
  JUD: 'JUD', JUDE: 'JUD', REV: 'REV'
};

export function bookInfo(id: string): BookInfo | undefined {
  return BY_ID.get(normaliseBookId(id));
}

export function normaliseBookId(raw: string): string {
  const k = raw.trim().toUpperCase().replace(/\s+/g, '');
  return ALIASES[k] ?? k;
}
