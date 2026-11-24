/**
 * Strong's numbers arrive in several spellings:
 *   STEPBible  G3972G, G0575, H9001/{H1961}, {H8199}
 *   unfoldingWord  G05750 (5 digits, trailing 0 = sense), b:H7225, c:H1961, H1961a
 *   older files  G575, H430
 * normStrong reduces all of them to one comparable form: letter + 4 digits (G0575, H1961).
 * For Hebrew words with prefixes it returns the main (content) number.
 */
export function normStrong(s: string | undefined | null): string {
  if (!s) return '';
  let t = String(s).trim();
  // STEPBible Hebrew: the main word is in braces — H9001/{H1961}
  const brace = /\{([^}]+)\}/.exec(t);
  if (brace) t = brace[1];
  // uW Hebrew prefixes: b:H7225, c:d:H1961 — keep the last segment
  if (t.includes(':')) t = t.split(':').pop()!;
  // morpheme lists without braces: take the last H/G number
  if (t.includes('/')) {
    const parts = t.split('/').filter((p) => /[GH]\d/.test(p));
    t = parts.length ? parts[parts.length - 1] : t;
  }
  const m = /^([GHgh])(\d+)/.exec(t);
  if (!m) return t;
  let d = m[2];
  if (m[1].toUpperCase() === 'G' && d.length === 5) d = d.slice(0, 4); // uW sense digit
  return m[1].toUpperCase() + d.replace(/^0+(?=\d)/, '').padStart(4, '0');
}

/** Two Strong's spellings refer to the same entry. */
export function sameStrong(a: string | undefined, b: string | undefined): boolean {
  const x = normStrong(a), y = normStrong(b);
  return !!x && x === y;
}
