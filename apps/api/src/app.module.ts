import { Global, Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AuditService } from './audit/audit.service';
import { AuthModule } from './auth/auth.module';
import { JwtAuthGuard } from './auth/jwt-auth.guard';
import { PermissionsGuard } from './auth/permissions.guard';
import { PrismaExceptionFilter } from './common/prisma-exception.filter';
import { CompaniesModule } from './companies/companies.module';
import { AppConfig } from './config/app-config.service';
import { AppConfigModule } from './config/config.module';
import { EmployeesModule } from './employees/employees.module';
import { HealthController } from './health/health.controller';
import { InfraModule } from './infra/infra.module';
import { MailModule } from './mail/mail.service';
import { NotificationsModule } from './notifications/notifications.module';
import { OutletsModule } from './outlets/outlets.module';
import { PaymentsModule } from './payments/payments.module';
import { PlatformModule } from './platform/platform.module';
import { PrismaModule } from './prisma/prisma.module';
import { TransactionsModule } from './transactions/transactions.module';

@Global()
@Module({ providers: [AuditService], exports: [AuditService] })
class AuditModule {}

@Module({
  imports: [
    AppConfigModule,
    PrismaModule,
    InfraModule,
    MailModule,
    AuditModule,
    ThrottlerModule.forRootAsync({
      inject: [AppConfig],
      useFactory: (config: AppConfig) => ({
        throttlers: [{ name: 'default', ttl: 60_000, limit: 300 }],
        // Automated tests hammer auth endpoints; rate limits are verified separately.
        skipIf: () => config.get('APP_ENV') === 'test',
      }),
    }),
    AuthModule,
    CompaniesModule,
    OutletsModule,
    EmployeesModule,
    PlatformModule,
    NotificationsModule,
    PaymentsModule,
    TransactionsModule,
  ],
  controllers: [HealthController],
  providers: [
    // Order matters: rate limit → authenticate → authorise.
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: PermissionsGuard },
    { provide: APP_FILTER, useClass: PrismaExceptionFilter },
  ],
})
export class AppModule {}
