const INLINE_TAGS = new Set([
  'b',
  'strong',
  'i',
  'em',
  'u',
  's',
  'del',
  'ins',
  'mark',
  'code',
  'sub',
  'sup',
]);

const NON_CONTENT_ENTITIES = /(?:&nbsp;|&#0*160;|&#x0*a0;)/gi;

function safeHref(value: string): boolean {
  if (/\s/.test(value) || value.includes(String.fromCharCode(127))) return false;
  if (!/^(?:https?:\/\/|mailto:)/i.test(value)) return false;
  try {
    const protocol = new URL(value.replace(/&amp;/gi, '&')).protocol.toLowerCase();
    return protocol === 'http:' || protocol === 'https:' || protocol === 'mailto:';
  } catch {
    return false;
  }
}

export function isSafeInfoPageMarkup(value: string): boolean {
  const stack: string[] = [];
  let offset = 0;

  while (offset < value.length) {
    const opening = value.indexOf('<', offset);
    if (opening < 0) break;
    const closing = value.indexOf('>', opening + 1);
    if (closing < 0) return false;
    const token = value.slice(opening, closing + 1);
    if (token.slice(1, -1).includes('<')) return false;

    if (/^<br\s*\/?\s*>$/i.test(token)) {
      offset = closing + 1;
      continue;
    }

    const anchor = token.match(/^<a\s+href=(['"])([^'"<>]*)\1>$/i);
    if (anchor) {
      if (!safeHref(anchor[2]) || stack.includes('a')) return false;
      stack.push('a');
      offset = closing + 1;
      continue;
    }

    const endTag = token.match(/^<\/([a-z]+)\s*>$/i);
    if (endTag) {
      const tag = endTag[1].toLowerCase();
      if (tag === 'a') {
        if (stack.pop() !== 'a') return false;
      } else if (!INLINE_TAGS.has(tag) || stack.pop() !== tag) {
        return false;
      }
      offset = closing + 1;
      continue;
    }

    const startTag = token.match(/^<([a-z]+)>$/i);
    if (!startTag || !INLINE_TAGS.has(startTag[1].toLowerCase())) return false;
    stack.push(startTag[1].toLowerCase());
    offset = closing + 1;
  }

  return stack.length === 0;
}

export function hasVisibleInfoPageText(value: string): boolean {
  return (
    value
      .replace(/<[^>]+>/g, '')
      .replace(NON_CONTENT_ENTITIES, ' ')
      .trim().length > 0
  );
}

export function escapeLegacyInfoPageText(value: string): string {
  return value
    .replace(/&(?!(?:amp|lt|gt|quot|apos|nbsp|#\d+|#x[\da-f]+);)/gi, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

export function preserveSafeLegacyText(value: string): string {
  return isSafeInfoPageMarkup(value) ? value : escapeLegacyInfoPageText(value);
}
