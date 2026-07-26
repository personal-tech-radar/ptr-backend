import { normalizeTechnologyInterestName } from './normalize-technology-interest-name.util';

describe('normalizeTechnologyInterestName', () => {
  it('lowercases, trims, and collapses internal whitespace', () => {
    expect(normalizeTechnologyInterestName('  React   Native  ')).toBe('react native');
  });

  it('preserves meaningful punctuation: "." in "Node.js"', () => {
    expect(normalizeTechnologyInterestName('Node.js')).toBe('node.js');
  });

  it('preserves meaningful punctuation: "#" in "C#"', () => {
    expect(normalizeTechnologyInterestName('C#')).toBe('c#');
  });

  it('preserves meaningful punctuation: "+" in "C++"', () => {
    expect(normalizeTechnologyInterestName('C++')).toBe('c++');
  });

  it('preserves a leading "." in ".NET"', () => {
    expect(normalizeTechnologyInterestName('.NET')).toBe('.net');
  });
});
