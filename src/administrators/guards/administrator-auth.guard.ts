import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

@Injectable()
export class AdministratorAuthGuard extends AuthGuard('administrator-jwt') {}
