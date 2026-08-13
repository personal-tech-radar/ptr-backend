import { Injectable, OnModuleInit } from '@nestjs/common';
import { readFileSync } from 'fs';
import OpenAI from 'openai';
import * as path from 'path';
import { SourceType } from '../entities/source.entity';
import { SanitizedProviderError } from '../../common/error/sanitized-provider.error';

export interface TaxonomySourceProposal {
  name: string;
  url: string;
  expectedSourceType: SourceType;
  streamKey: string;
  reason: string;
}

const stringValue = (value: unknown, fallback = ''): string =>
  typeof value === 'string' ? value.trim() : fallback;

@Injectable()
export class TaxonomySourceProposalService implements OnModuleInit {
  private openai: OpenAI;
  private prompt = '';

  onModuleInit(): void {
    this.openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    this.prompt = readFileSync(
      path.join(__dirname, '..', 'instructions', 'propose-taxonomy-sources.txt'),
      'utf8',
    );
  }

  async propose(
    taxonomyName: string,
    taxonomyKind: string,
    streamKey: string,
  ): Promise<TaxonomySourceProposal[]> {
    let response: Awaited<ReturnType<OpenAI['chat']['completions']['create']>>;
    try {
      response = await this.openai.chat.completions.create({
        model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
        messages: [
          { role: 'system', content: this.prompt },
          {
            role: 'user',
            content: `Kind: ${taxonomyKind}\nName: ${taxonomyName}\nStream: ${streamKey}`,
          },
        ],
        response_format: { type: 'json_object' },
        temperature: 0.2,
      });
    } catch (error) {
      const status = this.providerStatus(error);
      throw new SanitizedProviderError({
        provider: 'openai',
        status,
        requestType: 'taxonomy-source-proposal',
        retryable: status === null || status === 429 || status >= 500,
      });
    }
    const raw = response.choices[0]?.message?.content ?? '{}';
    const parsed = JSON.parse(raw) as { candidates?: unknown[] };
    if (!Array.isArray(parsed.candidates)) return [];
    return parsed.candidates
      .filter((item): item is Record<string, unknown> => !!item && typeof item === 'object')
      .map((item) => ({
        name: stringValue(item.name),
        url: stringValue(item.url),
        expectedSourceType: item.expectedSourceType as SourceType,
        streamKey: stringValue(item.streamKey, streamKey),
        reason: stringValue(item.reason),
      }))
      .filter(
        (item) =>
          item.name.length > 0 &&
          /^https?:\/\//i.test(item.url) &&
          item.streamKey === streamKey &&
          Object.values(SourceType).includes(item.expectedSourceType),
      )
      .slice(0, 3);
  }

  private providerStatus(error: unknown): number | null {
    if (!error || typeof error !== 'object') return null;
    const status = (error as { status?: unknown }).status;
    return typeof status === 'number' ? status : null;
  }
}
