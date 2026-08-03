import { randomUUID } from 'crypto';
import { Test, TestingModule } from '@nestjs/testing';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { ContentStream } from '../src/taxonomy/entities/content-stream.entity';
import { UserContentStream } from '../src/taxonomy/entities/user-content-stream.entity';
import { ContentStreamCommandService } from '../src/taxonomy/services/content-stream-command.service';
import { User } from '../src/users/entities/user.entity';

describe('Content-stream replacement transaction (e2e)', () => {
  let moduleRef: TestingModule;
  let dataSource: DataSource;
  let service: ContentStreamCommandService;

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [
        TypeOrmModule.forRoot({
          type: 'postgres',
          host: process.env.DB_HOST || 'localhost',
          port: Number(process.env.DB_PORT) || 5432,
          username: process.env.DB_USER || 'postgres',
          password: process.env.DB_PASSWORD || 'postgres',
          database: process.env.DB_NAME || 'ptr',
          entities: [User, ContentStream, UserContentStream],
          synchronize: false,
        }),
        TypeOrmModule.forFeature([ContentStream, UserContentStream]),
      ],
      providers: [ContentStreamCommandService],
    }).compile();
    dataSource = moduleRef.get(DataSource);
    service = moduleRef.get(ContentStreamCommandService);
  });

  afterAll(async () => moduleRef.close());

  it('retains the complete prior selection when insertion fails after deletion', async () => {
    const userRepo = dataSource.getRepository(User);
    const linkRepo = dataSource.getRepository(UserContentStream);
    const streams = await dataSource
      .getRepository(ContentStream)
      .find({ order: { sortOrder: 'ASC' } });
    expect(streams.length).toBeGreaterThanOrEqual(2);

    const suffix = randomUUID();
    const user = await userRepo.save(
      userRepo.create({
        email: `rollback-${suffix}@example.com`,
        passwordHash: 'integration-test-not-a-login-secret',
        displayName: `Rollback ${suffix}`,
        timezone: 'UTC',
        githubUrl: null,
        level: null,
        dailyDigestEnabled: false,
        weeklyDigestEnabled: false,
        emailVerifiedAt: null,
        onboardingCompletedAt: null,
        deletedAt: null,
      }),
    );
    await linkRepo.save(linkRepo.create({ userId: user.id, contentStreamId: streams[0].id }));

    await expect(
      service.linkUserSelections(user.id, [streams[1].id, randomUUID()]),
    ).rejects.toBeDefined();

    const after = await linkRepo.find({ where: { userId: user.id } });
    expect(after.map((link) => link.contentStreamId)).toEqual([streams[0].id]);
  });
});
