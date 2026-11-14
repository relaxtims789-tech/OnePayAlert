import { Body, Controller, Delete, Get, Headers, HttpCode, HttpStatus, Module, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiExcludeController, ApiOperation, ApiProperty, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import { SkipThrottle, Throttle } from '@nestjs/throttler';
import {
  DEVICE_SERIAL_PATTERN,
  Permission,
  type DeviceCredentialsDto,
  type DeviceDto,
  type DeviceTestResultDto,
  type Paginated,
  type PlatformDeviceDto,
} from '@onepay/shared';
import { Transform } from 'class-transformer';
import { IsBoolean, IsEnum, IsInt, IsOptional, IsString, IsUUID, Matches, Max, MaxLength, Min, MinLength, ValidateIf } from 'class-validator';
import { BillingModule } from '../billing/billing.module';
import type { AuthUser, TenantUser } from '../common/auth-user';
import { ClientIp, CurrentTenant, CurrentUser, Public, RequirePermissions } from '../common/decorators';
import { PaginationQueryDto } from '../common/pagination.dto';
import { RealtimeModule } from '../realtime/realtime.module';
import { DevicesService, type MqttAclRequest, type MqttAuthRequest, type MqttHookResult } from './devices.service';
import { mqttBridgeProvider } from './mqtt.bridge';

const upper = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim().toUpperCase() : value);
const LOCALES = ['km', 'en', 'zh'] as const;

export class RegisterDeviceDto {
  @ApiProperty({ example: 'SBX-000123', description: 'Printed on the device; becomes its MQTT username' })
  @Transform(upper)
  @Matches(DEVICE_SERIAL_PATTERN, { message: 'serialNumber must be 5-32 characters: A-Z, 0-9 and -' })
  serialNumber!: string;

  @ApiProperty({ example: 'OPA-SB1' }) @IsString() @MinLength(2) @MaxLength(64)
  model!: string;
}

export class ListDevicesQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: ['UNASSIGNED', 'ACTIVE', 'DISABLED'] })
  @IsOptional()
  @IsEnum(['UNASSIGNED', 'ACTIVE', 'DISABLED'])
  status?: 'UNASSIGNED' | 'ACTIVE' | 'DISABLED';
}

export class SetDisabledDto {
  @ApiProperty() @IsBoolean()
  disabled!: boolean;
}

export class ClaimDeviceDto {
  @ApiProperty({ example: 'SBX-000123' }) @IsString() @MinLength(5) @MaxLength(32)
  serialNumber!: string;

  @ApiProperty({ example: 'K7QF-2M9X', description: 'From the label on the box' }) @IsString() @MinLength(8) @MaxLength(12)
  claimCode!: string;

  @ApiPropertyOptional({ example: 'Front counter' }) @IsOptional() @IsString() @MaxLength(80)
  name?: string;

  @ApiPropertyOptional({ description: 'Announce only this outlet’s payments. Omit for every outlet.' }) @IsOptional() @IsUUID()
  outletId?: string;

  @ApiPropertyOptional({ enum: LOCALES }) @IsOptional() @IsEnum(LOCALES)
  locale?: 'km' | 'en' | 'zh';
}

export class UpdateDeviceDto {
  @ApiPropertyOptional({ nullable: true }) @IsOptional() @ValidateIf((_, v) => v !== null) @IsString() @MaxLength(80)
  name?: string | null;

  @ApiPropertyOptional({ nullable: true, description: 'null = announce every outlet' }) @IsOptional() @ValidateIf((_, v) => v !== null) @IsUUID()
  outletId?: string | null;

  @ApiPropertyOptional({ enum: LOCALES }) @IsOptional() @IsEnum(LOCALES)
  locale?: 'km' | 'en' | 'zh';

  @ApiPropertyOptional({ minimum: 0, maximum: 100 }) @IsOptional() @IsInt() @Min(0) @Max(100)
  volume?: number;

  @ApiPropertyOptional({ description: 'Also speak payments reported by a phone bank alert (not confirmed by the bank)' }) @IsOptional() @IsBoolean()
  announceReported?: boolean;
}

@ApiTags('Soundbox devices')
@ApiBearerAuth()
@Controller('devices')
export class DevicesController {
  constructor(private readonly devices: DevicesService) {}

  @Get()
  @RequirePermissions(Permission.DEVICE_READ)
  @ApiOperation({ summary: 'Soundboxes of the active company (outlet-restricted staff: their outlets only)' })
  list(@CurrentTenant() user: TenantUser): Promise<DeviceDto[]> {
    return this.devices.list(user);
  }

  @Post('claim')
  @RequirePermissions(Permission.DEVICE_MANAGE)
  // Claim codes are short; slow down guessing.
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiOperation({ summary: 'Add a soundbox with the serial number and claim code from its box (counts toward the plan)' })
  claim(@CurrentTenant() user: TenantUser, @Body() dto: ClaimDeviceDto, @ClientIp() ip: string | null): Promise<DeviceDto> {
    return this.devices.claim(user, dto, ip);
  }

  @Patch(':id')
  @RequirePermissions(Permission.DEVICE_MANAGE)
  @ApiOperation({ summary: 'Rename, move to an outlet, or change language/volume (sent to the device at once)' })
  update(
    @CurrentTenant() user: TenantUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateDeviceDto,
    @ClientIp() ip: string | null,
  ): Promise<DeviceDto> {
    return this.devices.update(user, id, dto, ip);
  }

  @Post(':id/test')
  @HttpCode(200)
  @RequirePermissions(Permission.DEVICE_MANAGE)
  @ApiOperation({ summary: 'Play a test announcement on the device' })
  test(@CurrentTenant() user: TenantUser, @Param('id', ParseUUIDPipe) id: string): Promise<DeviceTestResultDto> {
    return this.devices.test(user, id);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermissions(Permission.DEVICE_MANAGE)
  @ApiOperation({ summary: 'Remove the device from this company (it can be claimed again with its box code)' })
  release(@CurrentTenant() user: TenantUser, @Param('id', ParseUUIDPipe) id: string, @ClientIp() ip: string | null): Promise<void> {
    return this.devices.release(user, id, ip);
  }
}

@ApiTags('Platform (MysoftKH Super Admin)')
@ApiBearerAuth()
@Controller('platform/devices')
export class PlatformDevicesController {
  constructor(private readonly devices: DevicesService) {}

  @Get()
  @RequirePermissions(Permission.PLATFORM_COMPANIES_READ)
  @ApiOperation({ summary: 'Soundbox inventory (search by serial, name or merchant)' })
  list(@Query() q: ListDevicesQueryDto): Promise<Paginated<PlatformDeviceDto>> {
    return this.devices.listAll(q);
  }

  @Post()
  @RequirePermissions(Permission.PLATFORM_DEVICES_MANAGE)
  @ApiOperation({ summary: 'Register a soundbox. Returns its MQTT password and box claim code ONCE.' })
  register(@CurrentUser() actor: AuthUser, @Body() dto: RegisterDeviceDto, @ClientIp() ip: string | null): Promise<DeviceCredentialsDto> {
    return this.devices.register(actor, dto.serialNumber, dto.model, ip);
  }

  @Post(':id/rotate-secret')
  @HttpCode(200)
  @RequirePermissions(Permission.PLATFORM_DEVICES_MANAGE)
  @ApiOperation({ summary: 'Issue a new MQTT password (returned once); the old one stops working' })
  rotate(@CurrentUser() actor: AuthUser, @Param('id', ParseUUIDPipe) id: string, @ClientIp() ip: string | null): Promise<DeviceCredentialsDto> {
    return this.devices.rotateSecret(actor, id, ip);
  }

  @Patch(':id')
  @RequirePermissions(Permission.PLATFORM_DEVICES_MANAGE)
  @ApiOperation({ summary: 'Disable (refuse its MQTT login, stop all commands) or re-enable a device' })
  setDisabled(
    @CurrentUser() actor: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SetDisabledDto,
    @ClientIp() ip: string | null,
  ): Promise<PlatformDeviceDto> {
    return this.devices.setDisabled(actor, id, dto.disabled, ip);
  }
}

/**
 * EMQX HTTP authentication/authorization hooks. Not for browsers: they require the shared hook
 * secret header, and should only be reachable from the broker's network.
 */
@ApiExcludeController()
@Public()
@SkipThrottle()
@Controller('mqtt')
export class MqttHooksController {
  constructor(private readonly devices: DevicesService) {}

  @Post('auth')
  @HttpCode(200)
  async auth(@Headers('x-onepay-hook-secret') secret: string | undefined, @Body() body: MqttAuthRequest): Promise<MqttHookResult> {
    if (!this.devices.hookSecretValid(secret)) return { result: 'deny' };
    return this.devices.authenticate(body ?? {});
  }

  @Post('acl')
  @HttpCode(200)
  acl(@Headers('x-onepay-hook-secret') secret: string | undefined, @Body() body: MqttAclRequest): MqttHookResult {
    if (!this.devices.hookSecretValid(secret)) return { result: 'deny' };
    return this.devices.authorize(body ?? {});
  }
}

@Module({
  imports: [BillingModule, RealtimeModule],
  controllers: [DevicesController, PlatformDevicesController, MqttHooksController],
  providers: [DevicesService, mqttBridgeProvider],
  exports: [DevicesService, mqttBridgeProvider],
})
export class DevicesModule {}
