import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsOptional, IsString, MaxLength } from 'class-validator';

export class GenerateAiContentDto {
  @ApiProperty({ description: 'Current or source product title' })
  @IsString()
  @MaxLength(200)
  productTitle: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(8000)
  description?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(120)
  category?: string;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  keywords?: string[];

  @ApiPropertyOptional({ description: 'Writing tone, e.g. Professional' })
  @IsOptional()
  @IsString()
  @MaxLength(40)
  tone?: string;

  @ApiPropertyOptional({ description: 'OpenAI model override. Defaults to the configured model.' })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  model?: string;
}

export class AiStatusDto {
  @ApiProperty() configured: boolean;
  @ApiProperty() model: string;
}

export class AiTextResultDto {
  @ApiProperty() requestId: string;
  @ApiProperty() type: string;
  @ApiProperty() content: string;
  @ApiProperty() model: string;
  @ApiProperty() tokensUsed: number;
}

export class AiListResultDto {
  @ApiProperty() requestId: string;
  @ApiProperty() type: string;
  @ApiProperty({ type: [String] }) content: string[];
  @ApiProperty() model: string;
  @ApiProperty() tokensUsed: number;
}
