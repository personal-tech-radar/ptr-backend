import 'reflect-metadata';
import * as dotenv from 'dotenv';
import { DataSource } from 'typeorm';
import RssParser = require('rss-parser');
import { Source } from '../sources/entities/source.entity';
import sourcesData from '../../config/sources.seed.json';

dotenv.config();

async function validateFeedUrl(url: string): Promise<{ valid: boolean; reason?: string }> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; PersonalTechRadar/1.0)' },
    });
    clearTimeout(timeout);

    if (response.status !== 200) {
      return { valid: false, reason: `HTTP ${response.status}` };
    }

    const text = await response.text();
    const parser = new RssParser();
    const feed = await parser.parseString(text);

    if (!feed.items || feed.items.length === 0) {
      return { valid: false, reason: 'feed contains no items' };
    }

    return { valid: true };
  } catch (err) {
    return { valid: false, reason: err instanceof Error ? err.message : String(err) };
  }
}

async function seed(): Promise<void> {
  const dataSource = new DataSource({
    type: 'postgres',
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432', 10),
    username: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || 'postgres',
    database: process.env.DB_NAME || 'ptr',
    entities: [Source],
    synchronize: false,
  });

  await dataSource.initialize();
  const repo = dataSource.getRepository(Source);
  let inserted = 0;
  let skipped = 0;
  let failed = 0;

  for (const data of sourcesData) {
    const existing = await repo.findOne({ where: { url: data.url } });
    if (existing) {
      console.log(`Skip (exists): ${data.name}`);
      skipped++;
      continue;
    }

    const validation = await validateFeedUrl(data.url);
    if (!validation.valid) {
      console.error(`Skip (invalid feed): ${data.name} — ${validation.reason}`);
      failed++;
      continue;
    }

    await repo.save(repo.create(data as Partial<Source>));
    console.log(`Seeded: ${data.name}`);
    inserted++;
  }

  await dataSource.destroy();
  console.log(`\nDone. Inserted ${inserted}, skipped ${skipped} existing, skipped ${failed} invalid.`);
}

seed().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
