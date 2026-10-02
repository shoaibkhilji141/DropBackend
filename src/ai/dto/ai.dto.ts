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

export class AiModelOptionDto {
  @ApiProperty({ description: 'Value sent back on generate, e.g. groq:llama-3.3-70b-versatile' })
  id: string;
  @ApiProperty() label: string;
  @ApiProperty() provider: string;
}

export class AiStatusDto {
  @ApiProperty() configured: boolean;
  @ApiProperty() model: string;
  @ApiProperty() provider: string;
  @ApiProperty({ type: [AiModelOptionDto] }) models: AiModelOptionDto[];
}

export class AiTextResultDto {
  @ApiProperty() requestId: string;
  @ApiProperty() type: string;
  @ApiProperty() content: string;
  @ApiProperty() model: string;
  @ApiProperty() tokensUsed: number;
}

export class ListingFromUrlDto {
  @ApiProperty({ description: 'AliExpress product page URL or numeric product id' })
  @IsString()
  @MaxLength(4000)
  url: string;

  @ApiPropertyOptional({ description: 'AI model id from GET /ai/status, or auto' })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  model?: string;
}

export class ListingCopySpecDto {
  @ApiProperty() name: string;
  @ApiProperty() value: string;
}

export class ListingCopyProductDto {
  @ApiProperty() externalId: string;
  @ApiProperty() title: string;
  @ApiProperty({ type: [String] }) images: string[];
  @ApiProperty() sourceUrl: string;
  @ApiProperty() costPrice: number;
  @ApiProperty() currency: string;
  @ApiProperty() category: string;
  @ApiProperty() suggestedSellPrice: number;
  @ApiProperty({ type: [ListingCopySpecDto] }) specs: ListingCopySpecDto[];
}

export class ListingPolicyViolationDto {
  @ApiProperty() policy: string;
  @ApiProperty({ enum: ['prohibited', 'restricted', 'risk'] }) severity: string;
  @ApiProperty() reason: string;
  @ApiPropertyOptional() evidence?: string;
}

export class ListingPolicyAreaDto {
  @ApiProperty() area: string;
  @ApiProperty({ enum: ['pass', 'flag', 'fail'] }) status: string;
  @ApiProperty() note: string;
}

export class ListingPolicyCheckDto {
  @ApiProperty({ enum: ['list', 'review', 'do_not_list'] }) verdict: string;
  @ApiProperty() shouldList: boolean;
  @ApiProperty() summary: string;
  @ApiProperty() score: number;
  @ApiProperty() confidence: number;
  @ApiProperty({ type: [ListingPolicyViolationDto] }) violations: ListingPolicyViolationDto[];
  @ApiProperty({ type: [String] }) requirements: string[];
  @ApiProperty({ type: [ListingPolicyAreaDto] }) checks: ListingPolicyAreaDto[];
}

export class ListingCopyResultDto {
  @ApiProperty() requestId: string;
  @ApiProperty() model: string;
  @ApiProperty() tokensUsed: number;
  @ApiProperty() title: string;
  @ApiProperty() description: string;
  @ApiProperty({ type: [String] }) specs: string[];
  @ApiProperty({ type: [String] }) keywords: string[];
  @ApiProperty({ type: [String] }) highlights: string[];
  @ApiProperty({ type: ListingCopyProductDto }) product: ListingCopyProductDto;
  @ApiProperty({ type: ListingPolicyCheckDto }) policy: ListingPolicyCheckDto;
}

export class ListingSeoAspectDto {
  @ApiProperty() name: string;
  @ApiProperty() value: string;
}

export class ListingSeoResultDto {
  @ApiProperty({ description: 'eBay title of at most 80 characters' }) title: string;
  @ApiProperty({ description: 'Listing description as HTML' }) descriptionHtml: string;
  @ApiProperty({ type: [String] }) highlights: string[];
  @ApiProperty({ type: [String] }) keywords: string[];
  @ApiProperty({ type: [ListingSeoAspectDto] }) aspects: ListingSeoAspectDto[];
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
