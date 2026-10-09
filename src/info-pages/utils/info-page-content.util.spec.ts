import {
  hasVisibleInfoPageText,
  isSafeInfoPageMarkup,
  preserveSafeLegacyText,
} from './info-page-content.util';

describe('info-page inline content validation', () => {
  it('accepts safe formatting and supported link protocols', () => {
    expect(isSafeInfoPageMarkup('<strong>Formatted</strong> text')).toBe(true);
    expect(isSafeInfoPageMarkup('<a href="https://example.com/path?x=1&amp;y=2">web</a>')).toBe(
      true,
    );
    expect(isSafeInfoPageMarkup('<a href="mailto:help@example.com">email</a>')).toBe(true);
  });

  it('rejects unsafe protocols, extra attributes, unsupported tags, and mismatched markup', () => {
    expect(isSafeInfoPageMarkup('<a href="javascript:alert(1)">bad</a>')).toBe(false);
    expect(isSafeInfoPageMarkup('<a href="https://example.com" onclick="run()">bad</a>')).toBe(
      false,
    );
    expect(isSafeInfoPageMarkup('<img src="https://example.com/image.png">')).toBe(false);
    expect(isSafeInfoPageMarkup('<b>unclosed')).toBe(false);
    expect(isSafeInfoPageMarkup('</b>orphan')).toBe(false);
  });

  it('requires visible text and escapes unsafe legacy markup without losing its text', () => {
    expect(hasVisibleInfoPageText('<b>  </b>')).toBe(false);
    expect(hasVisibleInfoPageText('<a href="https://example.com"></a>')).toBe(false);
    expect(preserveSafeLegacyText('<script>alert(1)</script>')).toBe(
      '&lt;script&gt;alert(1)&lt;/script&gt;',
    );
  });
});
