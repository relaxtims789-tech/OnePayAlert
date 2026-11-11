import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsEnum,
  IsIn,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  MinLength,
  ValidateIf,
} from 'class-validator';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

/** Write-only secrets map, e.g. { "apiKey": "...", "merchantId": "..." }. Validated in the service. */
export type CredentialsInput = Record<string, string>;

export class CreateBankConnectionDto {
  @ApiProperty() @IsUUID()
  providerId!: string;

  @ApiProperty({ example: 'ABA USD main account' })
  @Transform(trim) @IsString() @MinLength(2) @MaxLength(120)
  displayName!: string;

  @ApiPropertyOptional() @IsOptional() @Transform(trim) @IsString() @MaxLength(160)
  accountName?: string;

  @ApiPropertyOptional({ description: 'Only the last 4 digits are stored' })
  @IsOptional()
  @Matches(/^[0-9 -]{4,34}$/, { message: 'accountNumber must be 4-34 digits' })
  accountNumber?: string;

  @ApiProperty({ enum: ['USD', 'KHR'] }) @IsEnum(['USD', 'KHR'])
  currency!: 'USD' | 'KHR';

  @ApiPropertyOptional({ description: 'Attribute payments to this outlet by default' })
  @IsOptional() @IsUUID()
  outletId?: string;

  @ApiPropertyOptional({ description: 'Write-only API credentials; encrypted at rest, never returned' })
  @IsOptional() @IsObject()
  credentials?: CredentialsInput;
}

export class UpdateBankConnectionDto {
  @ApiPropertyOptional() @IsOptional() @Transform(trim) @IsString() @MinLength(2) @MaxLength(120)
  displayName?: string;

  @ApiPropertyOptional() @IsOptional() @Transform(trim) @IsString() @MaxLength(160)
  accountName?: string;

  @ApiPropertyOptional({ nullable: true, description: 'null removes the default outlet' })
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsUUID()
  outletId?: string | null;

  @ApiPropertyOptional({ description: 'Replaces stored credentials' })
  @IsOptional() @IsObject()
  credentials?: CredentialsInput;
}

export class SimulatePaymentDto {
  @ApiProperty({ example: '12.50', description: 'Decimal string in the connection currency' })
  @Matches(/^\d{1,9}(\.\d{1,2})?$/, { message: 'amount must be a decimal string like 12.50' })
  amount!: string;

  @ApiPropertyOptional({ example: 'Sok Dara' })
  @IsOptional() @Transform(trim) @IsString() @MaxLength(160)
  payerName?: string;

  @ApiPropertyOptional({ enum: ['payment.succeeded', 'payment.pending', 'payment.failed'] })
  @IsOptional()
  @IsIn(['payment.succeeded', 'payment.pending', 'payment.failed'])
  type?: 'payment.succeeded' | 'payment.pending' | 'payment.failed';

  @ApiPropertyOptional() @IsOptional() @Matches(/^[A-Za-z0-9_-]{2,32}$/)
  outletCode?: string;
}
