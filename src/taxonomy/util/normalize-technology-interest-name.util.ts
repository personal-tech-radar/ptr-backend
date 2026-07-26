// Lowercases, trims, and collapses internal whitespace — but deliberately does not strip
// punctuation. "Node.js", "C#", ".NET" all depend on `.`/`#`/`+` surviving normalization
// unchanged, since those characters are meaningful parts of the canonical name.
export function normalizeTechnologyInterestName(raw: string): string {
  return raw.trim().toLowerCase().replace(/\s+/g, ' ');
}
