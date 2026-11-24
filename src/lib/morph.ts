/**
 * Morphology codes → readable English.
 * Greek: Robinson codes as used by STEPBible TAGNT (V-PAI-3S, N-GSM-T, P-1GS …).
 * Hebrew/Aramaic: OSHB codes as used by STEPBible TAHOT and the WLC (HNcmpc, Hc/Vqw3ms …).
 * unfoldingWord codes (UGNT "Gr,N,,,,,GFS,", UHB "He,C:Vqw3ms") are converted to these at
 * source-generation time with uwGreekToRobinson / uwHebrewToOshb, and are also decoded directly.
 */
const PART: Record<string, string> = {
  N: 'noun', A: 'adjective', T: 'article', V: 'verb', P: 'personal pronoun', R: 'relative pronoun',
  C: 'reciprocal pronoun', D: 'demonstrative pronoun', K: 'correlative pronoun', I: 'interrogative pronoun',
  X: 'indefinite pronoun', Q: 'correlative or interrogative pronoun', F: 'reflexive pronoun', S: 'possessive pronoun',
  ADV: 'adverb', CONJ: 'conjunction', COND: 'conditional', PRT: 'particle', PREP: 'preposition', INJ: 'interjection',
  ARAM: 'Aramaic word', HEB: 'Hebrew word'
};
const CASE: Record<string, string> = { N: 'nominative', G: 'genitive', D: 'dative', A: 'accusative', V: 'vocative' };
const NUM: Record<string, string> = { S: 'singular', P: 'plural' };
const GEN: Record<string, string> = { M: 'masculine', F: 'feminine', N: 'neuter' };
const TENSE: Record<string, string> = {
  P: 'present', I: 'imperfect', F: 'future', A: 'aorist', R: 'perfect', L: 'pluperfect',
  '2F': 'second future', '2A': 'second aorist', '2R': 'second perfect', '2L': 'second pluperfect'
};
const VOICE: Record<string, string> = {
  A: 'active', M: 'middle', P: 'passive', E: 'middle or passive', D: 'middle deponent',
  O: 'passive deponent', N: 'middle or passive deponent', Q: 'impersonal active', X: 'no voice'
};
const MOOD: Record<string, string> = {
  I: 'indicative', S: 'subjunctive', O: 'optative', M: 'imperative', N: 'infinitive', P: 'participle', R: 'imperative participle'
};
const SUFFIX: Record<string, string> = {
  P: 'proper name', T: 'title', L: 'location', G: 'gentilic', C: 'comparative', S: 'superlative',
  ATT: 'Attic form', ABB: 'abbreviated', I: 'interrogative', N: 'negative', K: 'contracted', LI: 'letter', NUI: 'indeclinable number',
  PRI: 'indeclinable proper name', OI: 'indeclinable'
};

function nominal(code: string): string {
  // [person]CNG or CNG, e.g. 1GS, NSM, GPF
  const m = /^([123])?([NGDAV])([SP])([MFN])?$/.exec(code);
  if (!m) return '';
  return [m[1] ? `${m[1] === '1' ? 'first' : m[1] === '2' ? 'second' : 'third'} person` : '', CASE[m[2]], NUM[m[3]], m[4] ? GEN[m[4]] : '']
    .filter(Boolean).join(' ');
}

function personNumber(code: string): string {
  const m = /^([123])([SP])$/.exec(code);
  if (!m) return '';
  return `${m[1] === '1' ? 'first' : m[1] === '2' ? 'second' : 'third'} person ${NUM[m[2]]}`;
}

export function describeGreek(code: string): string {
  if (!code) return '';
  const parts = code.split('-');
  const head = PART[parts[0]];
  if (!head) return '';
  if (parts[0] === 'V' && parts[1]) {
    const tvm = /^(2?[PIFARL])([AMPEDONQX])([ISOMNPR])$/.exec(parts[1]);
    if (!tvm) return head;
    const bits = [TENSE[tvm[1]], VOICE[tvm[2]], MOOD[tvm[3]]];
    const rest = parts[2] ? nominal(parts[2]) || personNumber(parts[2]) : '';
    return `verb — ${bits.join(' ')}${rest ? ', ' + rest : ''}`;
  }
  const rest = parts.slice(1).map((p) => nominal(p) || personNumber(p) || SUFFIX[p] || '').filter(Boolean);
  return rest.length ? `${head} — ${rest.join(', ')}` : head;
}

// ------------------------------------------------------------------ unfoldingWord Greek
/**
 * UGNT morphology is a fixed-position string after "Gr,": role, type, mood, tense, voice,
 * person, case, gender, number, degree — "," marks an empty slot.
 * e.g. "Gr,V,IIA3,,S," = verb, indicative imperfect active, 3rd singular → V-IAI-3S.
 */
export function uwGreekToRobinson(code: string): string {
  if (!code.startsWith('Gr,')) return code;
  const s = code.slice(3).padEnd(10, ',');
  const at = (i: number) => (s[i] === ',' ? '' : s[i]);
  const role = at(0), type = at(1), mood = at(2), tense = at(3), voice = at(4);
  const person = at(5), kase = at(6), gender = at(7), number = at(8), degree = at(9);
  const cng = `${kase}${number}${gender}`;
  const deg = degree === 'C' ? '-C' : degree === 'S' ? '-S' : '';
  const T: Record<string, string> = { P: 'P', I: 'I', F: 'F', A: 'A', E: 'R', L: 'L' };
  switch (role) {
    case 'V': {
      const tvm = `${T[tense] ?? tense}${voice || 'A'}${mood}`;
      if (mood === 'P') return `V-${tvm}-${cng}`;
      if (mood === 'N') return `V-${tvm}`;
      return `V-${tvm}${person || number ? `-${person}${number}` : ''}`;
    }
    case 'N':
      return `N-${cng}${type === 'P' ? '-P' : ''}`;
    case 'A':
      return `A-${cng}${deg}`;
    case 'E': {
      const head = type === 'A' ? 'T' : type === 'D' ? 'D' : type === 'R' ? 'R' : type === 'P' ? 'S' : 'A';
      return cng ? `${head}-${cng}` : head;
    }
    case 'R': {
      const head = ({ P: 'P', R: 'R', D: 'D', I: 'I', E: 'F', C: 'C', T: 'K' } as Record<string, string>)[type] ?? 'X';
      if (head === 'P' && person) return `P-${person}${kase}${number}`;
      if (head === 'F' && person) return `F-${person}${cng}`;
      return cng ? `${head}-${cng}` : head;
    }
    case 'C':
      return 'CONJ';
    case 'D':
      return 'ADV';
    case 'P':
      return 'PREP';
    case 'I':
      return 'INJ';
    case 'T':
      return 'PRT';
    default:
      return code;
  }
}

// ------------------------------------------------------------------ Hebrew (OSHB)
/** UHB "He,C:Vqw3ms" → OSHB "HC/Vqw3ms"; Aramaic "Ar,…" → "A…". */
export function uwHebrewToOshb(code: string): string {
  const m = /^(He|Ar),(.*)$/.exec(code);
  if (!m) return code;
  return (m[1] === 'He' ? 'H' : 'A') + m[2].replace(/:/g, '/');
}

const H_STEM: Record<string, string> = {
  q: 'qal', N: 'niphal', p: 'piel', P: 'pual', h: 'hiphil', H: 'hophal', t: 'hithpael', o: 'polel', O: 'polal',
  r: 'hithpolel', m: 'poel', M: 'poal', k: 'palel', K: 'pulal', Q: 'qal passive', l: 'pilpel', L: 'polpal',
  f: 'hithpalpel', D: 'nithpael', j: 'pealal', i: 'pilel', u: 'hothpaal', c: 'tiphil', v: 'hishtaphel',
  w: 'nithpalel', y: 'nithpoel', z: 'hithpoel', a: 'aphel', e: 'haphel', b: 'hophal', g: 'hithpeel',
  s: 'saphel', x: 'ishtaphel'
};
const H_CONJ: Record<string, string> = {
  p: 'perfect', q: 'sequential perfect', i: 'imperfect', w: 'sequential imperfect', h: 'cohortative', j: 'jussive',
  v: 'imperative', r: 'participle', s: 'passive participle', a: 'infinitive absolute', c: 'infinitive construct'
};
const H_GEN: Record<string, string> = { m: 'masculine', f: 'feminine', b: 'both genders', c: 'common' };
const H_NUM: Record<string, string> = { s: 'singular', p: 'plural', d: 'dual' };
const H_STATE: Record<string, string> = { a: 'absolute', c: 'construct', d: 'determined' };
const H_PERSON: Record<string, string> = { '1': 'first person', '2': 'second person', '3': 'third person' };
const H_PART: Record<string, string> = {
  a: 'affirmation', d: 'definite article', e: 'exhortation', i: 'interrogative', j: 'interjection', m: 'demonstrative',
  n: 'negative', o: 'object marker', r: 'relative'
};

function hebMorpheme(m: string): string {
  const pos = m[0], rest = m.slice(1);
  const list = (...xs: (string | undefined)[]) => xs.filter(Boolean).join(' ');
  switch (pos) {
    case 'V': {
      const stem = H_STEM[rest[0]] ?? '', conj = H_CONJ[rest[1]] ?? '';
      const tail = rest.slice(2);
      const pgn = /^[123]/.test(tail)
        ? list(H_PERSON[tail[0]], H_GEN[tail[1]], H_NUM[tail[2]])
        : list(H_GEN[tail[0]], H_NUM[tail[1]], H_STATE[tail[2]]);
      return `verb — ${list(stem, conj)}${pgn ? ', ' + pgn : ''}`;
    }
    case 'N': {
      if (rest[0] === 'p') {
        const k = ({ m: 'person', f: 'person', l: 'location', t: 'title' } as Record<string, string>)[rest[1]];
        return k ? `proper noun — ${k}` : 'proper noun';
      }
      const kind = rest[0] === 'g' ? 'gentilic noun' : 'noun';
      const g = list(H_GEN[rest[1]], H_NUM[rest[2]], H_STATE[rest[3]]);
      return g ? `${kind} — ${g}` : kind;
    }
    case 'A': {
      const kind = ({ a: 'adjective', c: 'cardinal number', g: 'gentilic', o: 'ordinal number' } as Record<string, string>)[rest[0]] ?? 'adjective';
      const g = list(H_GEN[rest[1]], H_NUM[rest[2]], H_STATE[rest[3]]);
      return g ? `${kind} — ${g}` : kind;
    }
    case 'P': {
      const kind = ({ d: 'demonstrative pronoun', f: 'indefinite pronoun', i: 'interrogative pronoun', p: 'personal pronoun', r: 'relative pronoun' } as Record<string, string>)[rest[0]] ?? 'pronoun';
      const g = list(H_PERSON[rest[1]], H_GEN[rest[2]], H_NUM[rest[3]]);
      return g ? `${kind} — ${g}` : kind;
    }
    case 'S':
      if (rest[0] === 'p') return `pronominal suffix — ${list(H_PERSON[rest[1]], H_GEN[rest[2]], H_NUM[rest[3]])}`;
      return ({ d: 'directional he', h: 'paragogic he', n: 'paragogic nun' } as Record<string, string>)[rest[0]] ?? 'suffix';
    case 'T':
      return `particle${H_PART[rest[0]] ? ' — ' + H_PART[rest[0]] : ''}`;
    case 'R':
      return rest[0] === 'd' ? 'preposition with article' : 'preposition';
    case 'C':
      return 'conjunction';
    case 'D':
      return 'adverb';
    default:
      return '';
  }
}

/** OSHB code ("HNcmpc/Sp3ms", "Hc/Vqw3ms", "ATd/Ncmsa") → readable English; '' if not OSHB. */
export function describeHebrew(code: string): string {
  const m = /^([HA])([A-Za-z].*)$/.exec(code);
  if (!m) return '';
  // TAHOT writes the conjunction prefix lower-case ("Hc/…")
  const parts = m[2].split('/').map((x) => (x === 'c' ? 'C' : x)).map(hebMorpheme);
  if (parts.some((p) => !p)) return '';
  return (m[1] === 'A' ? 'Aramaic: ' : '') + parts.join(' + ');
}

function describeOne(c: string): string {
  if (c.startsWith('Gr,')) return describeGreek(uwGreekToRobinson(c)) || c;
  if (/^(He|Ar),/.test(c)) return describeHebrew(uwHebrewToOshb(c)) || c;
  return describeGreek(c) || describeHebrew(c) || c;
}

/**
 * Decode one or more codes (an array, or a comma-separated list) into a readable line.
 * uW codes contain commas themselves, so a string starting "Gr,"/"He,"/"Ar," is one code.
 */
export function describeMorph(codes: string | string[]): string {
  const list = Array.isArray(codes) ? codes : /^(Gr|He|Ar),/.test(codes) ? [codes] : codes.split(',');
  return list.map((c) => c.trim()).filter(Boolean).map(describeOne).join(' · ');
}
