import { Body, Controller, Get, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { AIRequest } from '@prisma/client';
import { AiService } from './ai.service';
import {
  AiListResultDto,
  AiStatusDto,
  AiTextResultDto,
  GenerateAiContentDto,
  ListingCopyResultDto,
  ListingFromUrlDto,
} from './dto/ai.dto';

@ApiTags('ai')
@Controller('ai')
export class AiController {
  constructor(private readonly aiService: AiService) {}

  @Get('status')
  status(): AiStatusDto {
    return this.aiService.status();
  }

  @Get('history')
  history(): Promise<AIRequest[]> {
    return this.aiService.history();
  }

  @Post('from-url')
  fromUrl(@Body() dto: ListingFromUrlDto): Promise<ListingCopyResultDto> {
    return this.aiService.generateFromUrl(dto.url, dto.model);
  }

  @Post('title')
  generateTitle(@Body() dto: GenerateAiContentDto): Promise<AiTextResultDto> {
    return this.aiService.generateTitle(dto);
  }

  @Post('description')
  generateDescription(@Body() dto: GenerateAiContentDto): Promise<AiTextResultDto> {
    return this.aiService.generateDescription(dto);
  }

  @Post('improve-description')
  improveDescription(@Body() dto: GenerateAiContentDto): Promise<AiTextResultDto> {
    return this.aiService.improveDescription(dto);
  }

  @Post('keywords')
  generateKeywords(@Body() dto: GenerateAiContentDto): Promise<AiListResultDto> {
    return this.aiService.generateKeywords(dto);
  }

  @Post('highlights')
  generateHighlights(@Body() dto: GenerateAiContentDto): Promise<AiListResultDto> {
    return this.aiService.generateHighlights(dto);
  }
}
