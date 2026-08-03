import { TaxonomySourceProposalService } from './taxonomy-source-proposal.service';

describe('TaxonomySourceProposalService', () => {
  it('converts provider authentication errors into BullMQ-safe domain failures', async () => {
    const service = new TaxonomySourceProposalService();
    Object.defineProperty(service, 'openai', {
      value: {
        chat: {
          completions: {
            create: jest
              .fn()
              .mockRejectedValue(
                Object.assign(new Error('Incorrect API key sk-secret-fragment'), { status: 401 }),
              ),
          },
        },
      },
    });

    await expect(service.propose('OpenTelemetry', 'technology', 'security')).rejects.toThrow(
      'provider=openai status=401 requestType=taxonomy-source-proposal retryable=false',
    );
    await service.propose('OpenTelemetry', 'technology', 'security').catch((error: Error) => {
      expect(error.message).not.toContain('sk-secret-fragment');
      expect(error.stack).not.toContain('sk-secret-fragment');
    });
  });
});
