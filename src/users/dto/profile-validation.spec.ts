import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { OnboardingDto } from './onboarding.dto';
import { UpdateProfileDto } from './update-profile.dto';

describe('profile DTO validation', () => {
  it('accepts boolean digest settings and rejects non-booleans', async () => {
    const valid = await validate(
      plainToInstance(UpdateProfileDto, {
        dailyDigestEnabled: true,
        weeklyDigestEnabled: false,
      }),
    );
    const invalid = await validate(
      plainToInstance(UpdateProfileDto, { dailyDigestEnabled: 'yes' }),
    );

    expect(valid).toHaveLength(0);
    expect(invalid).toHaveLength(1);
  });

  it('trims and rejects an empty display name', async () => {
    const dto = plainToInstance(UpdateProfileDto, { displayName: '   ' });

    expect(dto.displayName).toBe('');
    await expect(validate(dto)).resolves.not.toHaveLength(0);
  });

  it('accepts only HTTPS github.com profile URLs and nullable removal', async () => {
    await expect(
      validate(plainToInstance(UpdateProfileDto, { githubUrl: 'https://github.com/openai' })),
    ).resolves.toHaveLength(0);
    await expect(
      validate(plainToInstance(UpdateProfileDto, { githubUrl: 'https://example.com/openai' })),
    ).resolves.not.toHaveLength(0);
    await expect(
      validate(plainToInstance(UpdateProfileDto, { githubUrl: 'http://github.com/openai' })),
    ).resolves.not.toHaveLength(0);
    await expect(
      validate(plainToInstance(UpdateProfileDto, { githubUrl: null })),
    ).resolves.toHaveLength(0);
  });

  it('uses the same GitHub profile rule during onboarding', async () => {
    const base = {
      timezone: 'Asia/Tbilisi',
      level: 'middle',
      technologyInterests: [{ kind: 'technology', name: 'Node.js' }],
      contentStreamIds: ['123e4567-e89b-42d3-a456-426614174000'],
    };

    await expect(
      validate(plainToInstance(OnboardingDto, { ...base, githubUrl: 'https://example.com/user' })),
    ).resolves.not.toHaveLength(0);
  });
});
