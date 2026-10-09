import { convertLegacyInfoPageDocument } from './legacy-info-page-document.util';

describe('legacy info-page document conversion', () => {
  it('maps headings, retains safe paragraphs, ids, time, and Editor.js version', () => {
    const converted = convertLegacyInfoPageDocument(
      JSON.stringify({
        time: 1700000000000,
        version: '2.28.0',
        blocks: [
          { id: 'heading-id', type: 'heading', data: { level: 1, text: 'Section' } },
          {
            id: 'paragraph-id',
            type: 'paragraph',
            data: { text: 'A <a href="https://example.com">safe link</a>.' },
          },
        ],
      }),
    );

    expect(converted).toEqual({
      time: 1700000000000,
      blocks: [
        { id: 'heading-id', type: 'header', data: { level: 2, text: 'Section' } },
        {
          id: 'paragraph-id',
          type: 'paragraph',
          data: { text: 'A <a href="https://example.com">safe link</a>.' },
        },
      ],
      version: '2.28.0',
    });
  });

  it('wraps plain and malformed legacy content as safe paragraph text', () => {
    expect(convertLegacyInfoPageDocument('plain legacy text')).toEqual({
      blocks: [{ type: 'paragraph', data: { text: 'plain legacy text' } }],
      version: '2.x',
    });
    expect(convertLegacyInfoPageDocument('{"blocks":[').blocks[0].data.text).toBe('{"blocks":[');
    expect(convertLegacyInfoPageDocument('<script>alert(1)</script>').blocks[0].data.text).toBe(
      '&lt;script&gt;alert(1)&lt;/script&gt;',
    );
  });

  it('preserves readable data from unknown blocks and normalizes heading levels', () => {
    expect(
      convertLegacyInfoPageDocument(
        JSON.stringify({
          blocks: [
            { type: 'heading', data: { level: 8, text: 'Legacy title' } },
            { type: 'image', data: { text: 'Image caption' } },
          ],
        }),
      ),
    ).toEqual({
      blocks: [
        { type: 'header', data: { level: 6, text: 'Legacy title' } },
        { type: 'paragraph', data: { text: 'Image caption' } },
      ],
      version: '2.x',
    });
  });

  it('escapes unsafe links from legacy data without discarding their content', () => {
    const converted = convertLegacyInfoPageDocument(
      JSON.stringify({
        blocks: [{ type: 'paragraph', data: { text: '<a href="javascript:alert(1)">unsafe</a>' } }],
      }),
    );
    expect(converted.blocks[0].data.text).toContain('&lt;a href="javascript:alert(1)"&gt;');
    expect(converted.blocks[0].data.text).toContain('unsafe');
  });
});
