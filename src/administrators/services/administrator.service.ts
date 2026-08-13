import { ConflictException, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import * as bcrypt from 'bcrypt';
import { Repository } from 'typeorm';
import { randomUUID } from 'crypto';
import { hashPassword } from '../../auth/utils/password-hash.util';
import {
  ChangeAdministratorPasswordDto,
  CreateAdministratorDto,
  QueryAdministratorsDto,
} from '../dto/administrator.dto';
import { Administrator } from '../entities/administrator.entity';
import { AdministratorRevokedToken } from '../entities/administrator-revoked-token.entity';

export const ADMIN_JWT_AUDIENCE = 'ptr-administrator';
export const ADMIN_JWT_SUBJECT_TYPE = 'administrator';

@Injectable()
export class AdministratorService {
  constructor(
    @InjectRepository(Administrator)
    private readonly repository: Repository<Administrator>,
    @InjectRepository(AdministratorRevokedToken)
    private readonly revokedTokens: Repository<AdministratorRevokedToken>,
    private readonly jwtService: JwtService,
  ) {}

  findById(id: string): Promise<Administrator | null> {
    return this.repository.findOne({ where: { id } });
  }

  async list(query: QueryAdministratorsDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const builder = this.repository.createQueryBuilder('administrator');
    if (query.email) {
      builder.andWhere('LOWER(administrator.email) LIKE :email', {
        email: `%${query.email.trim().toLowerCase()}%`,
      });
    }
    const [items, total] = await builder
      .orderBy('administrator.createdAt', 'ASC')
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();
    return {
      items: items.map((administrator) => this.toResponse(administrator)),
      total,
      page,
      limit,
    };
  }

  async create(dto: CreateAdministratorDto, createdByAdminId: string | null) {
    const email = dto.email.trim().toLowerCase();
    if (await this.repository.findOne({ where: { email } })) {
      throw new ConflictException('Administrator email already exists');
    }
    const administrator = await this.repository.save(
      this.repository.create({
        email,
        passwordHash: await hashPassword(dto.password),
        tokenVersion: 0,
        lastLoginAt: null,
        createdByAdminId,
      }),
    );
    return this.toResponse(administrator);
  }

  async login(email: string, password: string) {
    const administrator = await this.repository.findOne({
      where: { email: email.trim().toLowerCase() },
    });
    if (!administrator || !(await bcrypt.compare(password, administrator.passwordHash))) {
      throw new UnauthorizedException('Invalid email or password');
    }
    administrator.lastLoginAt = new Date();
    await this.repository.save(administrator);
    return this.issueToken(administrator);
  }

  async logout(jti: string, expiresAt: Date): Promise<void> {
    if (await this.revokedTokens.findOne({ where: { jti } })) return;
    await this.revokedTokens.save(this.revokedTokens.create({ jti, expiresAt }));
  }

  async isRevoked(jti: string): Promise<boolean> {
    return (await this.revokedTokens.findOne({ where: { jti } })) !== null;
  }

  async changePassword(id: string, dto: ChangeAdministratorPasswordDto): Promise<void> {
    const administrator = await this.repository.findOne({ where: { id } });
    if (
      !administrator ||
      !(await bcrypt.compare(dto.currentPassword, administrator.passwordHash))
    ) {
      throw new UnauthorizedException('Current password is invalid');
    }
    administrator.passwordHash = await hashPassword(dto.newPassword);
    administrator.tokenVersion += 1;
    await this.repository.save(administrator);
  }

  private issueToken(administrator: Administrator) {
    const ttl = process.env.ADMIN_JWT_EXPIRES_IN || '15m';
    const jti = randomUUID();
    const accessToken = this.jwtService.sign(
      {
        sub: administrator.id,
        email: administrator.email,
        subjectType: ADMIN_JWT_SUBJECT_TYPE,
        tokenVersion: administrator.tokenVersion,
      },
      { audience: ADMIN_JWT_AUDIENCE, expiresIn: ttl as never, jwtid: jti },
    );
    return { accessToken, tokenType: 'Bearer' as const, expiresIn: 900 };
  }

  private toResponse(administrator: Administrator) {
    return {
      id: administrator.id,
      email: administrator.email,
      lastLoginAt: administrator.lastLoginAt,
      createdByAdminId: administrator.createdByAdminId,
      createdAt: administrator.createdAt,
      updatedAt: administrator.updatedAt,
    };
  }
}
