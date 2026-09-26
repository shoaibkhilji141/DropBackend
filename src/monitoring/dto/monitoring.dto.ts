import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { MonitoringType } from '@prisma/client';
import { Transform, Type } from 'class-transformer';
import { IsBoolean, IsEnum, IsInt, IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class CreateMonitoringRuleDto {
  @ApiProperty()
  @IsString()
  productId: string;

  @ApiProperty({ enum: MonitoringType })
  @IsEnum(MonitoringType)
  type: MonitoringType;

  @ApiPropertyOptional({ description: 'Change threshold. Price/shipping are percent, stock is units.' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  threshold?: number;

  @ApiPropertyOptional({ description: 'Check frequency in minutes', default: 15 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  intervalMinutes?: number;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;
}

export class UpdateMonitoringRuleDto {
  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  threshold?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  intervalMinutes?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;
}

export class ListAlertsQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  unreadOnly?: boolean;
}

export class RunMonitoringDto {
  @ApiPropertyOptional({ enum: MonitoringType })
  @IsOptional()
  @IsEnum(MonitoringType)
  type?: MonitoringType;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  productId?: string;

  @ApiPropertyOptional({ description: 'Ignore nextRunAt and check immediately' })
  @IsOptional()
  @IsBoolean()
  force?: boolean;
}
