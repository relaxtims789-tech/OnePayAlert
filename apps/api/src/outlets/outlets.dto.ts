import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { IsBoolean, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';
import { PaginationQueryDto } from '../common/pagination.dto';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);
const upper = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim().toUpperCase() : value;

export class CreateOutletDto {
  @ApiProperty({ example: 'BKK1 Branch' })
  @Transform(trim)
  @IsString()
  @MinLength(2)
  @MaxLength(160)
  name!: string;

  @ApiProperty({ example: 'BKK1', description: 'Short unique code within the company' })
  @Transform(upper)
  @Matches(/^[A-Z0-9_-]{2,32}$/, { message: 'code must be 2-32 chars: A-Z, 0-9, _ or -' })
  code!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(500)
  address?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Matches(/^\+?[0-9]{8,15}$/)
  phone?: string;
}

export class UpdateOutletDto {
  @ApiPropertyOptional() @IsOptional() @Transform(trim) @IsString() @MinLength(2) @MaxLength(160)
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(upper)
  @Matches(/^[A-Z0-9_-]{2,32}$/, { message: 'code must be 2-32 chars: A-Z, 0-9, _ or -' })
  code?: string;

  @ApiPropertyOptional() @IsOptional() @Transform(trim) @IsString() @MaxLength(500)
  address?: string;

  @ApiPropertyOptional() @IsOptional() @Matches(/^\+?[0-9]{8,15}$/)
  phone?: string;

  @ApiPropertyOptional() @IsOptional() @IsBoolean()
  isActive?: boolean;
}

export class ListOutletsQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @Transform(({ value }) => (value === 'true' ? true : value === 'false' ? false : value))
  @Type(() => Boolean)
  @IsBoolean()
  isActive?: boolean;
}
