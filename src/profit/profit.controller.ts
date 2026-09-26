import { Body, Controller, Get, Patch, Post, Query } from '@nestjs/common';
import { ApiQuery, ApiTags } from '@nestjs/swagger';
import { ProfitType } from '@prisma/client';
import {
  CalculateProfitDto,
  ProfitBreakdownDto,
  ProfitSettingsDto,
  UpdateProfitSettingsDto,
} from './dto/profit.dto';
import { ProfitRecordWithRefs, ProfitService } from './profit.service';

@ApiTags('profit')
@Controller('profit')
export class ProfitController {
  constructor(private readonly profitService: ProfitService) {}

  @Get('settings')
  settings(): Promise<ProfitSettingsDto> {
    return this.profitService.getSettings();
  }

  @Patch('settings')
  updateSettings(@Body() dto: UpdateProfitSettingsDto): Promise<ProfitSettingsDto> {
    return this.profitService.updateSettings(dto);
  }

  @Post('calculate')
  calculate(@Body() dto: CalculateProfitDto): Promise<ProfitBreakdownDto> {
    return this.profitService.calculate(dto);
  }

  @Get('history')
  @ApiQuery({ name: 'type', required: false, enum: ProfitType })
  history(@Query('type') type?: ProfitType): Promise<ProfitRecordWithRefs[]> {
    return this.profitService.history(type);
  }

  @Get('totals')
  totals(): Promise<{ type: ProfitType; profit: number; revenue: number }[]> {
    return this.profitService.totals();
  }
}
