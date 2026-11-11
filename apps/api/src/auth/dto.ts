import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsEmail,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

const lower = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim().toLowerCase() : value;
const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

/** At least 10 chars with upper, lower and a digit. */
export const PASSWORD_REGEX = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{10,128}$/;
export const PASSWORD_MESSAGE =
  'Password must be 10-128 characters and include upper case, lower case and a number';

export class RegisterMerchantDto {
  @ApiProperty({ example: 'Sok Dara' })
  @Transform(trim)
  @IsString()
  @MinLength(2)
  @MaxLength(160)
  fullName!: string;

  @ApiProperty({ example: 'owner@coffee.com.kh' })
  @Transform(lower)
  @IsEmail()
  @MaxLength(254)
  email!: string;

  @ApiProperty({ example: 'Str0ngPassw0rd' })
  @IsString()
  @Matches(PASSWORD_REGEX, { message: PASSWORD_MESSAGE })
  password!: string;

  @ApiPropertyOptional({ example: '+85512345678' })
  @IsOptional()
  @Transform(trim)
  @Matches(/^\+?[0-9]{8,15}$/, { message: 'phone must be 8-15 digits, optionally starting with +' })
  phone?: string;

  @ApiProperty({ example: 'Dara Coffee' })
  @Transform(trim)
  @IsString()
  @MinLength(2)
  @MaxLength(160)
  companyName!: string;

  @ApiPropertyOptional({ enum: ['USD', 'KHR'], default: 'USD' })
  @IsOptional()
  @IsEnum(['USD', 'KHR'])
  defaultCurrency?: 'USD' | 'KHR';

  @ApiPropertyOptional({ enum: ['km', 'en', 'zh'], default: 'km' })
  @IsOptional()
  @IsEnum(['km', 'en', 'zh'])
  locale?: 'km' | 'en' | 'zh';
}

export class LoginDto {
  @ApiProperty()
  @Transform(lower)
  @IsEmail()
  email!: string;

  @ApiProperty()
  @IsString()
  @MaxLength(128)
  password!: string;

  @ApiPropertyOptional({ description: 'Company to sign in to. Defaults to the first membership.' })
  @IsOptional()
  @IsUUID()
  companyId?: string;
}

export class RefreshDto {
  @ApiProperty()
  @IsString()
  @MinLength(20)
  @MaxLength(200)
  refreshToken!: string;
}

export class SwitchCompanyDto {
  @ApiProperty()
  @IsUUID()
  companyId!: string;
}

export class UpdateProfileDto {
  @ApiPropertyOptional() @IsOptional() @Transform(trim) @IsString() @MinLength(2) @MaxLength(160)
  fullName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(trim)
  @Matches(/^\+?[0-9]{8,15}$/, { message: 'phone must be 8-15 digits, optionally starting with +' })
  phone?: string;

  @ApiPropertyOptional({ enum: ['km', 'en', 'zh'] }) @IsOptional() @IsEnum(['km', 'en', 'zh'])
  locale?: 'km' | 'en' | 'zh';
}

export class ChangePasswordDto {
  @ApiProperty() @IsString() @MaxLength(128)
  currentPassword!: string;

  @ApiProperty() @IsString() @Matches(PASSWORD_REGEX, { message: PASSWORD_MESSAGE })
  newPassword!: string;
}

export class ForgotPasswordDto {
  @ApiProperty() @Transform(lower) @IsEmail() @MaxLength(254)
  email!: string;
}

export class ResetPasswordDto {
  @ApiProperty() @IsString() @MinLength(20) @MaxLength(200)
  token!: string;

  @ApiProperty() @IsString() @Matches(PASSWORD_REGEX, { message: PASSWORD_MESSAGE })
  newPassword!: string;
}
