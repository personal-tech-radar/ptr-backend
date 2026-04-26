import { Injectable, OnModuleInit } from '@nestjs/common';
import { readFileSync } from 'fs';
import OpenAI from 'openai';
import * as path from 'path';
import { LoggingService } from '../../common/logging/logging.service';
import { DigestType } from '../entities/digest.entity';
import { ScoredCandidate } from '../digest.types';

@Injectable()
export class AiDigestService implements OnModuleInit {
  private readonly logger = new LoggingService(AiDigestService.name);
  private openai: OpenAI;
  private readonly prompts = new Map<DigestType, string>();

  onModuleInit(): void {
    this.openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    this.loadPrompt(DigestType.DAILY, 'generate-daily-intro.txt');
    this.loadPrompt(DigestType.WEEKLY, 'generate-weekly-intro.txt');
    this.loadPrompt(DigestType.DEEP_DIVE_WEEKLY, 'generate-deep-dive-intro.txt');
  }

  private loadPrompt(type: DigestType, filename: string): void {
    try {
      const filePath = path.join(__dirname, '..', 'instructions', filename);
      this.prompts.set(type, readFileSync(filePath, 'utf8'));
    } catch (err) {
      this.logger.error(`Failed to load prompt file: ${filename}`, err);
      this.prompts.set(type, '');
    }
  }

  async generateIntro(type: DigestType, selected: ScoredCandidate[]): Promise<string> {
    const template = this.prompts.get(type) ?? '';
    if (!template) {
      return this.fallbackIntro(type);
    }

    const articlesList = selected
      .map((c, i) => {
        const article = c.analysis.article;
        const tags = c.analysis.tags?.join(', ') ?? '';
        return `${i + 1}. "${article.title}" — ${article.source?.name ?? ''} [${tags}]`;
      })
      .join('\n');

    const prompt = template.replace('{{ARTICLES_LIST}}', articlesList);

    try {
      const response = await this.openai.chat.completions.create({
        model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.4,
        max_tokens: 150,
      });
      const text = response.choices[0]?.message?.content?.trim() ?? '';
      return text || this.fallbackIntro(type);
    } catch (err) {
      this.logger.error('Failed to generate digest intro via OpenAI', err);
      return this.fallbackIntro(type);
    }
  }

  private fallbackIntro(type: DigestType): string {
    return type === DigestType.WEEKLY
      ? "This week's selection covers key engineering topics across backend architecture, infrastructure, and AI engineering."
      : "Today's selection covers key engineering topics across backend architecture, infrastructure, and AI engineering.";
  }
}
