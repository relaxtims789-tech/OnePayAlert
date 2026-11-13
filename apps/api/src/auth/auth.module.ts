import { Global, Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { AppConfig } from '../config/app-config.service';
import { AccountService } from './account.service';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { LoginLockoutService } from './login-lockout.service';
import { PasswordService } from './password.service';
import { PrincipalService } from './principal.service';
import { TokenService } from './token.service';

@Global()
@Module({
  imports: [
    JwtModule.registerAsync({
      inject: [AppConfig],
      useFactory: (config: AppConfig) => ({
        secret: config.get('JWT_ACCESS_SECRET'),
        signOptions: { algorithm: 'HS256', issuer: 'onepayalert', audience: 'onepayalert-api' },
        verifyOptions: { algorithms: ['HS256'], issuer: 'onepayalert', audience: 'onepayalert-api' },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, AccountService, PasswordService, TokenService, PrincipalService, LoginLockoutService],
  exports: [JwtModule, PasswordService, PrincipalService],
})
export class AuthModule {}
