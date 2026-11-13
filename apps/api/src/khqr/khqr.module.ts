import {
  Body,
  Controller,
  Get,
  HttpCode,
  Injectable,
  Logger,
  Module,
  Param,
  ParseUUIDPipe,
  Post,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiProperty, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Permission, type KhqrAccountDto, type KhqrChargeDto, type KhqrStatusDto } from '@onepay/shared';
import { IsOptional, IsString, IsUUID, Matches } from 'class-validator';
import type { TenantUser } from '../common/auth-user';
import { CurrentTenant, RequirePermissions } from '../common/decorators';
import { AppConfig } from '../config/app-config.service';
import { PaymentsModule } from '../payments/payments.module';
import { RealtimeModule } from '../realtime/realtime.module';
import { BakongModule } from './bakong.module';
import { KhqrService } from './khqr.service';

export class CreateKhqrChargeDto {
  @ApiProperty({ description: 'An active Bakong KHQR bank connection' })
  @IsUUID()
  bankConnectionId!: string;

  @ApiProperty({ example: '12.50', description: 'Decimal amount in the connection currency' })
  @IsString()
  @Matches(/^\d{1,10}(\.\d{1,2})?$/, { message: 'amount must be a positive decimal with at most 2 decimals' })
  amount!: string;

  @ApiPropertyOptional({ description: 'Outlet the payment is for (defaults to the connection’s or the cashier’s)' })
  @IsOptional()
  @IsUUID()
  outletId?: string;
}

@ApiTags('KHQR collection')
@ApiBearerAuth()
@Controller('khqr')
export class KhqrController {
  constructor(private readonly khqr: KhqrService) {}

  @Get('status')
  @RequirePermissions(Permission.PAYMENT_COLLECT)
  @ApiOperation({ summary: 'Whether KHQR payments are confirmed with the live Bakong API, simulated (demo), or off' })
  status(): KhqrStatusDto {
    return this.khqr.status();
  }

  @Get('accounts')
  @RequirePermissions(Permission.PAYMENT_COLLECT)
  @ApiOperation({ summary: 'Bakong accounts this member can show a KHQR code for' })
  accounts(@CurrentTenant() user: TenantUser): Promise<KhqrAccountDto[]> {
    return this.khqr.accounts(user);
  }

  @Post('charges')
  @RequirePermissions(Permission.PAYMENT_COLLECT)
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @ApiOperation({ summary: 'Create a KHQR code for an amount; it is confirmed with Bakong automatically' })
  create(@CurrentTenant() user: TenantUser, @Body() dto: CreateKhqrChargeDto): Promise<KhqrChargeDto> {
    return this.khqr.create(user, dto);
  }

  @Get('charges/:id')
  @RequirePermissions(Permission.PAYMENT_COLLECT)
  @ApiOperation({ summary: 'Status of a KHQR payment request (also pushed live as khqr.charge.updated)' })
  get(@CurrentTenant() user: TenantUser, @Param('id', ParseUUIDPipe) id: string): Promise<KhqrChargeDto> {
    return this.khqr.get(user, id);
  }

  @Post('charges/:id/cancel')
  @HttpCode(200)
  @RequirePermissions(Permission.PAYMENT_COLLECT)
  cancel(@CurrentTenant() user: TenantUser, @Param('id', ParseUUIDPipe) id: string): Promise<KhqrChargeDto> {
    return this.khqr.cancel(user, id);
  }

  @Post('charges/:id/simulate-paid')
  @HttpCode(200)
  @RequirePermissions(Permission.PAYMENT_COLLECT)
  @ApiOperation({ summary: 'Demo only (no Bakong token): act as the customer paying the code' })
  simulatePaid(@CurrentTenant() user: TenantUser, @Param('id', ParseUUIDPipe) id: string): Promise<KhqrChargeDto> {
    return this.khqr.simulatePaid(user, id);
  }
}

/** Checks pending KHQR codes with Bakong every KHQR_POLL_INTERVAL_MS. */
@Injectable()
export class KhqrPoller implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(KhqrPoller.name);
  private timer: NodeJS.Timeout | null = null;
  private running = false;

  constructor(
    private readonly khqr: KhqrService,
    private readonly config: AppConfig,
  ) {}

  onApplicationBootstrap(): void {
    const ms = this.config.get('KHQR_POLL_INTERVAL_MS');
    if (ms <= 0 || this.khqr.status().mode === 'off') return;
    this.timer = setInterval(() => void this.tick(), ms);
    this.timer.unref();
  }

  onApplicationShutdown(): void {
    if (this.timer) clearInterval(this.timer);
  }

  private async tick(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      await this.khqr.pollOnce();
    } catch (e) {
      this.logger.error('KHQR polling failed', e instanceof Error ? e.stack : String(e));
    } finally {
      this.running = false;
    }
  }
}

@Module({
  imports: [PaymentsModule, RealtimeModule, BakongModule],
  controllers: [KhqrController],
  providers: [KhqrService, KhqrPoller],
  exports: [KhqrService],
})
export class KhqrModule {}
