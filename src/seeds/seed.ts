import 'reflect-metadata';
import * as dotenv from 'dotenv';
import { DataSource } from 'typeorm';
import { Source } from '../sources/entities/source.entity';
import sourcesData from '../../config/sources.seed.json';

dotenv.config();

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

  for (const data of sourcesData) {
    const existing = await repo.findOne({ where: { url: data.url } });
    if (!existing) {
      await repo.save(repo.create(data as Partial<Source>));
      console.log(`Seeded: ${data.name}`);
      inserted++;
    } else {
      console.log(`Skip (exists): ${data.name}`);
    }
  }

  await dataSource.destroy();
  console.log(`\nDone. Inserted ${inserted} source(s).`);
}

seed().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
