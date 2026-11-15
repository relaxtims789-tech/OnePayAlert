import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Inject, Module, Param, Post, Put } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiProperty, ApiTags } from '@nestjs/swagger';
import {
  Permission,
  isPlatformSettingKey,
  jwtExpiry,
  type PlatformSettingKey,
  type PlatformSettingsDto,
  type SettingTestResultDto,
} from '@onepay/shared';
import { IsString, MaxLength } from 'class-validator';
import { randomBytes } from 'node:crypto';
import { apiError } from '../common/api-error';
import type { AuthUser } from '../common/auth-user';
import { ClientIp, CurrentUser, RequirePermissions } from '../common/decorators';
import { BAKONG_CLIENT, BAKONG_LIVE_FACTORY, BakongError, type BakongClient, type BakongLiveFactory } from '../khqr/bakong.client';
import { BakongModule } from '../khqr/bakong.module';
import { MailService } from '../mail/mail.service';
import { PrismaService } from '../prisma/prisma.service';
import { PlatformSettingsService } from './platform-settings.service';

export class SetPlatformSettingDto {
  @ApiProperty({ description: 'The new value. Secrets (Bakong token, mail server) are never returned afterwards.' })
  @IsString()
  @MaxLength(4000)
  value!: string;
}

const keyOf = (raw: string): PlatformSettingKey => {
  if (!isPlatformSettingKey(raw)) throw apiError(HttpStatus.NOT_FOUND, 'SETTING_NOT_FOUND');
  return raw;
};

/** Removes anything secret-looking from a technical error before staff see it. */
const scrub = (message: string, secrets: (string | undefined)[]): string => {
  let out = message;
  for (const s of secrets) if (s && s.length >= 4) out = out.split(s).join('••••');
  return out.length > 300 ? `${out.slice(0, 297)}…` : out;
};

/**
 * System settings in the admin console: the Bakong token, the mail server and sender, and the
 * payment text on invoices. Super Admin only; every change is audited without its value.
 */
@ApiTags('Platform (MysoftKH Super Admin)')
@ApiBearerAuth()
@Controller('platform/settings')
export class PlatformSettingsController {
  constructor(
    private readonly settings: PlatformSettingsService,
    private readonly mail: MailService,
    private readonly prisma: PrismaService,
    @Inject(BAKONG_CLIENT) private readonly bakong: BakongClient,
    @Inject(BAKONG_LIVE_FACTORY) private readonly bakongLive: BakongLiveFactory,
  ) {}

  @Get()
  @RequirePermissions(Permission.PLATFORM_SETTINGS_MANAGE)
  @ApiOperation({ summary: 'Settings in use and where each comes from (secrets are only hinted)' })
  get(): PlatformSettingsDto {
    const token = this.settings.get('BAKONG_API_TOKEN');
    return {
      settings: this.settings.list(),
      bakongMode: this.bakong.mode,
      bakongTokenExpiresAt: token ? (jwtExpiry(token)?.toISOString() ?? null) : null,
      mailDriver: this.mail.driver,
    };
  }

  @Put(':key')
  @RequirePermissions(Permission.PLATFORM_SETTINGS_MANAGE)
  @ApiOperation({ summary: 'Save a setting; it takes effect at once and overrides the env file' })
  async set(@CurrentUser() user: AuthUser, @Param('key') key: string, @Body() dto: SetPlatformSettingDto, @ClientIp() ip: string | null): Promise<PlatformSettingsDto> {
    await this.settings.set(keyOf(key), dto.value, user.userId, ip);
    return this.get();
  }

  @Delete(':key')
  @RequirePermissions(Permission.PLATFORM_SETTINGS_MANAGE)
  @ApiOperation({ summary: 'Remove the saved value: the env file value (or the default) is used again' })
  async clear(@CurrentUser() user: AuthUser, @Param('key') key: string, @ClientIp() ip: string | null): Promise<PlatformSettingsDto> {
    await this.settings.clear(keyOf(key), user.userId, ip);
    return this.get();
  }

  @Post(':key/test')
  @HttpCode(200)
  @RequirePermissions(Permission.PLATFORM_SETTINGS_MANAGE)
  @ApiOperation({ summary: 'Bakong token: ask Bakong whether it accepts it. Mail server: send a test email to you.' })
  async test(@CurrentUser() user: AuthUser, @Param('key') raw: string): Promise<SettingTestResultDto> {
    const key = keyOf(raw);
    if (key === 'BAKONG_API_TOKEN') return this.testBakong();
    if (key === 'SMTP_URL') return this.testMail(user);
    throw apiError(HttpStatus.NOT_FOUND, 'SETTING_NOT_FOUND');
  }

  private async testBakong(): Promise<SettingTestResultDto> {
    const token = this.settings.get('BAKONG_API_TOKEN');
    if (!token) return { ok: false, reason: 'NOT_SET', detail: null };
    try {
      // A made-up MD5: a valid token gets "not found", a bad one gets 401.
      await this.bakongLive(token).checkMd5(randomBytes(16).toString('hex'));
      return { ok: true, reason: 'OK', detail: null };
    } catch (e) {
      const message = scrub(e instanceof Error ? e.message : String(e), [token]);
      if (e instanceof BakongError && !e.retryable) return { ok: false, reason: 'REJECTED', detail: message };
      return { ok: false, reason: 'UNREACHABLE', detail: message };
    }
  }

  private async testMail(user: AuthUser): Promise<SettingTestResultDto> {
    const url = this.settings.get('SMTP_URL');
    if (!url && this.mail.driver === 'smtp') return { ok: false, reason: 'NOT_SET', detail: null };
    const me = await this.prisma.user.findUniqueOrThrow({ where: { id: user.userId }, select: { email: true } });
    try {
      await this.mail.send({
        to: me.email,
        subject: 'One PayAlert test email',
        text: 'This test email was sent from the One PayAlert admin console. The mail server works.',
        html: '<p>This test email was sent from the One PayAlert admin console. The mail server works.</p>',
      });
      return { ok: true, reason: 'OK', detail: me.email };
    } catch (e) {
      let password: string | undefined;
      try {
        password = url ? decodeURIComponent(new URL(url).password) : undefined;
      } catch {
        password = undefined;
      }
      return { ok: false, reason: 'FAILED', detail: scrub(e instanceof Error ? e.message : String(e), [password, url]) };
    }
  }
}

@Module({ imports: [BakongModule], controllers: [PlatformSettingsController] })
export class PlatformSettingsModule {}
