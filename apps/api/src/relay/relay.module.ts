import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Module,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
  type RawBodyRequest,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiProperty, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Permission, type RelayNotificationResult, type RelayPhoneDto, type RelayPhoneEnrollment } from '@onepay/shared';
import { IsISO8601, IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';
import type { Request } from 'express';
import type { TenantUser } from '../common/auth-user';
import { ClientIp, CurrentTenant, Public, RequirePermissions } from '../common/decorators';
import { PaymentsModule } from '../payments/payments.module';
import { RelayService } from './relay.service';

export class EnrollRelayPhoneDto {
  @ApiProperty({ description: 'A "Bank alerts on your phone" connection' }) @IsUUID()
  bankConnectionId!: string;

  @ApiProperty({ example: 'Owner phone' }) @IsString() @MinLength(1) @MaxLength(80)
  name!: string;
}

export class RelayNotificationDto {
  @ApiProperty() @IsString() @MinLength(8) @MaxLength(128)
  key!: string;

  @ApiProperty({ example: 'com.paygo24.ibank' }) @IsString() @MinLength(1) @MaxLength(160)
  app!: string;

  @ApiPropertyOptional({ nullable: true }) @IsOptional() @IsString() @MaxLength(300)
  title?: string | null;

  @ApiProperty() @IsString() @MinLength(1) @MaxLength(2000)
  text!: string;

  @ApiProperty() @IsISO8601()
  postedAt!: string;
}

@ApiTags('Phone bank alerts')
@Controller('relay')
export class RelayController {
  constructor(private readonly relay: RelayService) {}

  @ApiBearerAuth()
  @Post('phones')
  @RequirePermissions(Permission.BANK_CONNECTION_MANAGE)
  @ApiOperation({ summary: 'Set up this phone to forward bank app alerts. The secret is returned once.' })
  enroll(@CurrentTenant() user: TenantUser, @Body() dto: EnrollRelayPhoneDto, @ClientIp() ip: string | null): Promise<RelayPhoneEnrollment> {
    return this.relay.enroll(user, dto, ip);
  }

  @ApiBearerAuth()
  @Get('phones')
  @RequirePermissions(Permission.BANK_CONNECTION_READ)
  list(@CurrentTenant() user: TenantUser, @Query('bankConnectionId') bankConnectionId?: string): Promise<RelayPhoneDto[]> {
    return this.relay.list(user, bankConnectionId && /^[0-9a-f-]{36}$/i.test(bankConnectionId) ? bankConnectionId : undefined);
  }

  @ApiBearerAuth()
  @Delete('phones/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermissions(Permission.BANK_CONNECTION_MANAGE)
  @ApiOperation({ summary: 'Stop accepting alerts from a phone (lost, replaced, or staff left)' })
  async revoke(@CurrentTenant() user: TenantUser, @Param('id', ParseUUIDPipe) id: string, @ClientIp() ip: string | null): Promise<void> {
    await this.relay.revoke(user, id, ip);
  }

  @Public()
  @Throttle({ default: { limit: 240, ttl: 60_000 } })
  @Post('notifications')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'A bank app notification forwarded by a set-up phone',
    description:
      'Headers: X-OnePay-Relay-Id, X-OnePay-Timestamp (unix seconds), X-OnePay-Signature: v1=hex(HMAC_SHA256(secret, "<timestamp>.<raw body>")). ' +
      'Payments become REPORTED transactions; anything that is not clearly money received is ignored.',
  })
  receive(
    @Headers() headers: Record<string, string | string[] | undefined>,
    @Req() req: RawBodyRequest<Request>,
    @Body() dto: RelayNotificationDto,
  ): Promise<RelayNotificationResult> {
    return this.relay.receive(headers, req.rawBody, dto);
  }
}

@Module({
  imports: [PaymentsModule],
  controllers: [RelayController],
  providers: [RelayService],
})
export class RelayModule {}
