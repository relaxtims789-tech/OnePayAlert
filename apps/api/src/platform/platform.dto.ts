import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { PaginationQueryDto } from '../common/pagination.dto';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

export class CompanyStatusDto {
  @ApiProperty({ enum: ['ACTIVE', 'SUSPENDED', 'CLOSED'] })
  @IsEnum(['ACTIVE', 'SUSPENDED', 'CLOSED'])
  status!: 'ACTIVE' | 'SUSPENDED' | 'CLOSED';

  @ApiPropertyOptional({ description: 'Why the status changed (kept in the audit log)' })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(500)
  reason?: string;
}

export class ListCompaniesQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: ['PENDING', 'ACTIVE', 'SUSPENDED', 'CLOSED'] })
  @IsOptional()
  @IsEnum(['PENDING', 'ACTIVE', 'SUSPENDED', 'CLOSED'])
  status?: 'PENDING' | 'ACTIVE' | 'SUSPENDED' | 'CLOSED';
}

const SUB_STATUSES = ['TRIALING', 'ACTIVE', 'PAST_DUE', 'CANCELED', 'EXPIRED'] as const;

export class UpdateSubscriptionDto {
  @ApiPropertyOptional() @IsOptional() @IsUUID()
  planId?: string;

  @ApiPropertyOptional({ enum: SUB_STATUSES }) @IsOptional() @IsEnum(SUB_STATUSES)
  status?: (typeof SUB_STATUSES)[number];

  @ApiPropertyOptional({ description: 'ISO date-time' }) @IsOptional() @IsDateString()
  currentPeriodEnd?: string;

  @ApiPropertyOptional({ description: 'ISO date-time' }) @IsOptional() @IsDateString()
  trialEndsAt?: string;
}

export class CreatePlanDto {
  @ApiProperty({ example: 'GROWTH' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toUpperCase() : value))
  @Matches(/^[A-Z0-9_]{2,40}$/, { message: 'code must be 2-40 chars: A-Z, 0-9 or _' })
  code!: string;

  @ApiProperty() @Transform(trim) @IsString() @MinLength(2) @MaxLength(120)
  name!: string;

  @ApiProperty({ description: 'Price in integer minor units (e.g. 2900 = $29.00)' })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(1_000_000_000)
  priceMinor!: number;

  @ApiProperty({ enum: ['USD', 'KHR'] }) @IsEnum(['USD', 'KHR'])
  currency!: 'USD' | 'KHR';

  @ApiProperty({ enum: ['MONTH', 'YEAR'] }) @IsEnum(['MONTH', 'YEAR'])
  interval!: 'MONTH' | 'YEAR';

  @ApiProperty() @Type(() => Number) @IsInt() @Min(0) @Max(100_000)
  maxOutlets!: number;

  @ApiProperty() @Type(() => Number) @IsInt() @Min(0) @Max(100_000)
  maxEmployees!: number;

  @ApiProperty() @Type(() => Number) @IsInt() @Min(0) @Max(100_000)
  maxBankConns!: number;

  @ApiProperty() @Type(() => Number) @IsInt() @Min(0) @Max(100_000)
  maxDevices!: number;
}

export class UpdatePlanDto {
  @ApiPropertyOptional() @IsOptional() @Transform(trim) @IsString() @MinLength(2) @MaxLength(120)
  name?: string;

  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(1_000_000_000)
  priceMinor?: number;

  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(100_000)
  maxOutlets?: number;

  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(100_000)
  maxEmployees?: number;

  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(100_000)
  maxBankConns?: number;

  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(100_000)
  maxDevices?: number;

  @ApiPropertyOptional() @IsOptional() @IsBoolean()
  isActive?: boolean;
}

export class PlatformAuditQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional() @IsOptional() @IsUUID()
  companyId?: string;

  @ApiPropertyOptional({ description: 'Action prefix, e.g. "platform." or "auth.login"' })
  @IsOptional()
  @Matches(/^[a-z_.]{1,80}$/)
  action?: string;
}
