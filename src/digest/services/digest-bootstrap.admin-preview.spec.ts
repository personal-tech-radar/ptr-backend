/* eslint-disable @typescript-eslint/require-await */
import { DigestBootstrapService } from './digest-bootstrap.service';
import { DigestDeliveryMode, DigestType } from '../entities/digest.entity';

describe('DigestBootstrapService administrator preview', () => {
  it('builds with the target profile while persisting administrator delivery metadata', async () => {
    const user = { id: 'user-1' };
    const builder = { buildForUser: jest.fn(async () => ({ id: 'digest-1' })) };
    const users = { findById: jest.fn(async () => user) };
    const service = new DigestBootstrapService(builder as never, users as never);

    await service.buildAdministratorPreview(
      'user-1',
      DigestType.WEEKLY,
      'administrator-1',
      'administrator@example.com',
    );

    expect(builder.buildForUser).toHaveBeenCalledWith(
      user,
      DigestType.WEEKLY,
      expect.stringMatching(/^admin-preview:administrator-1:/),
      {
        mode: DigestDeliveryMode.ADMIN_PREVIEW,
        triggeringAdministratorId: 'administrator-1',
        actualRecipientEmail: 'administrator@example.com',
      },
    );
  });
});
