/* eslint-disable @typescript-eslint/require-await, @typescript-eslint/no-unsafe-return */
import { AdministratorBootstrapService } from './administrator-bootstrap.service';

jest.mock('../../auth/utils/password-hash.util', () => ({
  hashPassword: jest.fn(async () => 'hash'),
}));

describe('AdministratorBootstrapService', () => {
  const repository = {
    findOne: jest.fn(),
    create: jest.fn((value) => value),
    save: jest.fn(async (value) => value),
  };
  const originalEmail = process.env.ADMIN_EMAIL;
  const originalPassword = process.env.ADMIN_PASSWORD;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.ADMIN_EMAIL = 'miter.sidorov.ps@gmail.com';
    process.env.ADMIN_PASSWORD = 'bootstrap-password';
  });

  afterAll(() => {
    process.env.ADMIN_EMAIL = originalEmail;
    process.env.ADMIN_PASSWORD = originalPassword;
  });

  it('creates the initial administrator once', async () => {
    repository.findOne.mockResolvedValue(null);
    await new AdministratorBootstrapService(repository as never).onModuleInit();
    expect(repository.save).toHaveBeenCalledTimes(1);
    expect(repository.create).toHaveBeenCalledWith(
      expect.objectContaining({ email: 'miter.sidorov.ps@gmail.com', createdByAdminId: null }),
    );
  });

  it('does not duplicate or reset an existing administrator', async () => {
    repository.findOne.mockResolvedValue({ id: 'admin-1' });
    await new AdministratorBootstrapService(repository as never).onModuleInit();
    expect(repository.save).not.toHaveBeenCalled();
  });
});
