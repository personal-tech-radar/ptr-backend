import type { InfoPageDocument } from '../models/info-page-document.model';
import {
  escapeLegacyInfoPageText,
  hasVisibleInfoPageText,
  preserveSafeLegacyText,
} from './info-page-content.util';

type JsonRecord = Record<string, unknown>;

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function serialized(value: unknown): string {
  if (typeof value === 'string') return value;
  try {
    return JSON.stringify(value) ?? String(value);
  } catch {
    return String(value);
  }
}

function safeText(value: string): string {
  const preserved = preserveSafeLegacyText(value);
  if (hasVisibleInfoPageText(preserved)) return preserved;
  return '[Legacy info-page content was empty]';
}

function blockId(block: JsonRecord): string | undefined {
  return typeof block.id === 'string' && block.id.trim() ? block.id : undefined;
}

function headerLevel(value: unknown): 2 | 3 | 4 | 5 | 6 {
  const level = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(level)) return 2;
  return Math.min(6, Math.max(2, Math.trunc(level))) as 2 | 3 | 4 | 5 | 6;
}

function textForBlock(block: unknown): string {
  if (isRecord(block) && isRecord(block.data) && typeof block.data.text === 'string') {
    return block.data.text;
  }
  return serialized(block);
}

function convertBlock(block: unknown): InfoPageDocument['blocks'][number] {
  const record = isRecord(block) ? block : {};
  const data = isRecord(record.data) ? record.data : {};
  const text = safeText(textForBlock(block));
  const id = blockId(record);

  if (record.type === 'heading' || record.type === 'header') {
    return {
      ...(id ? { id } : {}),
      type: 'header',
      data: { text, level: headerLevel(data.level) },
    };
  }

  return {
    ...(id ? { id } : {}),
    type: 'paragraph',
    data: { text },
  };
}

function fallbackText(parsed: unknown, raw: string): string {
  if (typeof parsed === 'string') return parsed;
  if (parsed === null || typeof parsed === 'number' || typeof parsed === 'boolean') {
    return String(parsed);
  }
  if (isRecord(parsed) && typeof parsed.content === 'string') return parsed.content;
  return raw;
}

export function convertLegacyInfoPageDocument(raw: string): InfoPageDocument {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    parsed = undefined;
  }

  const legacy = isRecord(parsed) ? parsed : undefined;
  const blocks =
    legacy && Array.isArray(legacy.blocks)
      ? legacy.blocks.map(convertBlock)
      : [{ type: 'paragraph' as const, data: { text: safeText(fallbackText(parsed, raw)) } }];
  const outputBlocks =
    blocks.length > 0
      ? blocks
      : [{ type: 'paragraph' as const, data: { text: '[Legacy info-page content was empty]' } }];

  return {
    ...(legacy && typeof legacy.time === 'number' && Number.isFinite(legacy.time)
      ? { time: legacy.time }
      : {}),
    blocks: outputBlocks,
    version: legacy && typeof legacy.version === 'string' ? legacy.version : '2.x',
  };
}

export function escapeUnsafeLegacyText(raw: string): string {
  return escapeLegacyInfoPageText(raw);
}
