import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { AccessTokenClaims, AuthTokens, CompanyRole, PlatformRole } from '@onepay/shared';
import { createHash, randomBytes } from 'node:crypto';
import { AppConfig } from '../config/app-config.service';

export interface IssueInput {
  userId: string;
  sessionId: string;
  companyId: string | null;
  companyRole: CompanyRole | null;
  platformRole: PlatformRole | null;
}

@Injectable()
export class TokenService {
  constructor(
    private readonly jwt: JwtService,
    private readonly config: AppConfig,
  ) {}

  /** Opaque, high-entropy refresh token. Only its SHA-256 hash is persisted. */
  newRefreshToken(): { token: string; hash: string } {
    const token = randomBytes(48).toString('base64url');
    return { token, hash: TokenService.hashRefreshToken(token) };
  }

  static hashRefreshToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  refreshExpiry(): Date {
    return new Date(Date.now() + this.config.get('REFRESH_TOKEN_TTL_DAYS') * 86_400_000);
  }

  async issue(input: IssueInput, refreshToken: string): Promise<AuthTokens> {
    const claims: AccessTokenClaims = {
      sub: input.userId,
      sid: input.sessionId,
      cid: input.companyId,
      crole: input.companyRole,
      prole: input.platformRole,
    };
    const ttl = this.config.get('JWT_ACCESS_TTL_SECONDS');
    const accessToken = await this.jwt.signAsync({ ...claims }, { expiresIn: ttl });
    return { accessToken, refreshToken, accessTokenExpiresIn: ttl };
  }
}
