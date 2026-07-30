import * as bcrypt from 'bcrypt';
import { AdminBootstrapService } from './admin-bootstrap.service';
import { UserCommandService } from '../../users/services/user-command.service';
import { UserQueryService } from '../../users/services/user-query.service';
import { UserRole } from '../../users/entities/user.entity';

describe('AdminBootstrapService', () => {
  let service: AdminBootstrapService;

  const mockUserCommandService = {
    create: jest.fn(),
    resurrectAsAdmin: jest.fn(),
  };

  const mockUserQueryService = {
    findByEmailIncludingDeleted: jest.fn(),
  };

  const originalAdminEmail = process.env.ADMIN_EMAIL;
  const originalAdminPassword = process.env.ADMIN_PASSWORD;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new AdminBootstrapService(
      mockUserCommandService as unknown as UserCommandService,
      mockUserQueryService as unknown as UserQueryService,
    );
  });

  afterEach(() => {
    process.env.ADMIN_EMAIL = originalAdminEmail;
    process.env.ADMIN_PASSWORD = originalAdminPassword;
  });

  it('throws and never creates/resurrects when ADMIN_EMAIL is unset', async () => {
    delete process.env.ADMIN_EMAIL;
    process.env.ADMIN_PASSWORD = 'super-secret';

    await expect(service.onModuleInit()).rejects.toThrow(
      'ADMIN_EMAIL environment variable is not configured.',
    );
    expect(mockUserCommandService.create).not.toHaveBeenCalled();
    expect(mockUserCommandService.resurrectAsAdmin).not.toHaveBeenCalled();
  });

  it('throws and never creates/resurrects when ADMIN_PASSWORD is unset', async () => {
    process.env.ADMIN_EMAIL = 'admin@example.com';
    delete process.env.ADMIN_PASSWORD;

    await expect(service.onModuleInit()).rejects.toThrow(
      'ADMIN_PASSWORD environment variable is not configured.',
    );
    expect(mockUserCommandService.create).not.toHaveBeenCalled();
    expect(mockUserCommandService.resurrectAsAdmin).not.toHaveBeenCalled();
  });

  it('creates a new admin when no user occupies ADMIN_EMAIL', async () => {
    process.env.ADMIN_EMAIL = 'admin@example.com';
    process.env.ADMIN_PASSWORD = 'super-secret';

    mockUserQueryService.findByEmailIncludingDeleted.mockResolvedValue(null);
    mockUserCommandService.create.mockResolvedValue({
      id: 'new-admin-id',
      email: 'admin@example.com',
    });

    await service.onModuleInit();

    expect(mockUserCommandService.create).toHaveBeenCalledTimes(1);
    const createArg = mockUserCommandService.create.mock.calls[0][0];
    expect(createArg.email).toBe('admin@example.com');
    expect(createArg.role).toBe(UserRole.ADMIN);
    expect(createArg.emailVerifiedAt).toBeInstanceOf(Date);
    expect(createArg.onboardingCompletedAt).toBeInstanceOf(Date);
    await expect(bcrypt.compare('super-secret', createArg.passwordHash)).resolves.toBe(true);
    expect(mockUserCommandService.resurrectAsAdmin).not.toHaveBeenCalled();
  });

  it('is a no-op and never resets the password when an active user already occupies ADMIN_EMAIL', async () => {
    process.env.ADMIN_EMAIL = 'admin@example.com';
    process.env.ADMIN_PASSWORD = 'super-secret';

    mockUserQueryService.findByEmailIncludingDeleted.mockResolvedValue({
      id: 'existing-id',
      email: 'admin@example.com',
      deletedAt: null,
    });

    await service.onModuleInit();

    expect(mockUserCommandService.create).not.toHaveBeenCalled();
    expect(mockUserCommandService.resurrectAsAdmin).not.toHaveBeenCalled();
  });

  it('resurrects a soft-deleted user occupying ADMIN_EMAIL instead of creating a new one', async () => {
    process.env.ADMIN_EMAIL = 'admin@example.com';
    process.env.ADMIN_PASSWORD = 'super-secret';

    mockUserQueryService.findByEmailIncludingDeleted.mockResolvedValue({
      id: 'deleted-id',
      email: 'admin@example.com',
      deletedAt: new Date(),
    });
    mockUserCommandService.resurrectAsAdmin.mockResolvedValue({
      id: 'deleted-id',
    });

    await service.onModuleInit();

    expect(mockUserCommandService.resurrectAsAdmin).toHaveBeenCalledWith('deleted-id');
    expect(mockUserCommandService.create).not.toHaveBeenCalled();
  });
});
