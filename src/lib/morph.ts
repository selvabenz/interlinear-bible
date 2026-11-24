/**
 * Morphology codes → readable English.
 * Greek: Robinson codes as used by STEPBible TAGNT (V-PAI-3S, N-GSM-T, P-1GS …).
 * Hebrew (OSHB codes such as HNcmpc) is shown as-is until a decoder is added (see backlog).
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

/** Decode one or more codes (comma-separated or array) into a readable line. */
export function describeMorph(codes: string | string[]): string {
  const list = Array.isArray(codes) ? codes : codes.split(',');
  return list.map((c) => c.trim()).filter(Boolean).map((c) => describeGreek(c) || c).join(' · ');
}
