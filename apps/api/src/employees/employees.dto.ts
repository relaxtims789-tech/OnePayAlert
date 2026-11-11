import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsEmail,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import { PASSWORD_MESSAGE, PASSWORD_REGEX } from '../auth/dto';

const ROLES = ['ADMIN', 'MANAGER', 'ACCOUNTANT', 'CASHIER'] as const;
type AssignableRole = (typeof ROLES)[number];

const lower = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim().toLowerCase() : value;
const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

export class CreateEmployeeDto {
  @ApiProperty() @Transform(lower) @IsEmail() @MaxLength(254)
  email!: string;

  @ApiProperty() @Transform(trim) @IsString() @MinLength(2) @MaxLength(160)
  fullName!: string;

  @ApiPropertyOptional() @IsOptional() @Matches(/^\+?[0-9]{8,15}$/)
  phone?: string;

  @ApiProperty({ enum: ROLES }) @IsEnum(ROLES)
  role!: AssignableRole;

  @ApiProperty({
    description:
      'Initial password for a NEW user (ignored when the email already has an account). ' +
      'The employee should change it after first login.',
  })
  @IsString()
  @Matches(PASSWORD_REGEX, { message: PASSWORD_MESSAGE })
  initialPassword!: string;

  @ApiPropertyOptional({ type: [String], description: 'Restrict to these outlets. Empty = all.' })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(200)
  @IsUUID('all', { each: true })
  outletIds?: string[];
}

export class UpdateEmployeeDto {
  @ApiPropertyOptional({ enum: ROLES }) @IsOptional() @IsEnum(ROLES)
  role?: AssignableRole;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(200)
  @IsUUID('all', { each: true })
  outletIds?: string[];

  @ApiPropertyOptional({ description: 'false removes the employee’s access to this company' })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
