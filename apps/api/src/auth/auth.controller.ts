import { Body, Controller, Get, HttpCode, HttpStatus, Post, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { AuthTokens, MeResponse } from '@onepay/shared';
import type { Request } from 'express';
import type { AuthUser } from '../common/auth-user';
import { CurrentUser, Public } from '../common/decorators';
import { AuthService, type ClientInfo } from './auth.service';
import { LoginDto, RefreshDto, RegisterMerchantDto, SwitchCompanyDto } from './dto';

function clientInfo(req: Request): ClientInfo {
  return { ip: req.ip ?? null, userAgent: req.headers['user-agent'] ?? null };
}

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('register')
  @ApiOperation({ summary: 'Register a new merchant (owner account + company + main outlet)' })
  register(@Body() dto: RegisterMerchantDto, @Req() req: Request): Promise<AuthTokens> {
    return this.auth.registerMerchant(dto, clientInfo(req));
  }

  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Sign in with email and password' })
  login(@Body() dto: LoginDto, @Req() req: Request): Promise<AuthTokens> {
    return this.auth.login(dto, clientInfo(req));
  }

  @Public()
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Rotate refresh token and get a new access token' })
  refresh(@Body() dto: RefreshDto, @Req() req: Request): Promise<AuthTokens> {
    return this.auth.refresh(dto.refreshToken, clientInfo(req));
  }

  @Public()
  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Revoke a refresh token' })
  async logout(@Body() dto: RefreshDto): Promise<void> {
    await this.auth.logout(dto.refreshToken);
  }

  @ApiBearerAuth()
  @Post('switch-company')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Switch the active company (tenant) for this session' })
  switchCompany(
    @CurrentUser() user: AuthUser,
    @Body() dto: SwitchCompanyDto,
    @Req() req: Request,
  ): Promise<AuthTokens> {
    return this.auth.switchCompany(user.userId, user.sessionId, dto.companyId, clientInfo(req));
  }

  @ApiBearerAuth()
  @Get('me')
  @ApiOperation({ summary: 'Current user, active company, role and permissions' })
  me(@CurrentUser() user: AuthUser): Promise<MeResponse> {
    return this.auth.me(user.userId, user.companyId);
  }
}
