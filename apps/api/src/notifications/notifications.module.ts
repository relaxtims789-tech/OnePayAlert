import { Body, Controller, Delete, HttpCode, HttpStatus, Module, Put } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiProperty, ApiTags } from '@nestjs/swagger';
import { IsEnum, IsString, MaxLength, MinLength } from 'class-validator';
import type { AuthUser } from '../common/auth-user';
import { CurrentUser } from '../common/decorators';
import { PrismaService } from '../prisma/prisma.service';
import { RealtimeModule } from '../realtime/realtime.module';
import { DevicesModule } from '../devices/devices.module';
import { NotificationsService } from './notifications.service';
import { pushSenderProvider } from './push.sender';

export class RegisterPushTokenDto {
  @ApiProperty() @IsString() @MinLength(20) @MaxLength(512)
  token!: string;

  @ApiProperty({ enum: ['ANDROID', 'IOS', 'WEB'] }) @IsEnum(['ANDROID', 'IOS', 'WEB'])
  platform!: 'ANDROID' | 'IOS' | 'WEB';
}

export class RemovePushTokenDto {
  @ApiProperty() @IsString() @MinLength(20) @MaxLength(512)
  token!: string;
}

@ApiTags('Notifications')
@ApiBearerAuth()
@Controller('me/push-tokens')
export class PushTokensController {
  constructor(private readonly prisma: PrismaService) {}

  @Put()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Register this device’s FCM token for payment alerts' })
  async register(@CurrentUser() user: AuthUser, @Body() dto: RegisterPushTokenDto): Promise<void> {
    // A device token belongs to whoever signed in on it last.
    await this.prisma.pushToken.upsert({
      where: { token: dto.token },
      update: { userId: user.userId, platform: dto.platform },
      create: { token: dto.token, platform: dto.platform, userId: user.userId },
    });
  }

  @Delete()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Unregister a device token (call on sign-out)' })
  async remove(@CurrentUser() user: AuthUser, @Body() dto: RemovePushTokenDto): Promise<void> {
    await this.prisma.pushToken.deleteMany({ where: { token: dto.token, userId: user.userId } });
  }
}

@Module({
  imports: [RealtimeModule, DevicesModule],
  controllers: [PushTokensController],
  providers: [NotificationsService, pushSenderProvider],
  exports: [NotificationsService],
})
export class NotificationsModule {}

