import { Body, Controller, Get, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { MonitoringType } from '@prisma/client';
import { RunMonitoringDto } from '../monitoring/dto/monitoring.dto';
import { MonitoringScheduler } from './monitoring-scheduler.service';

@ApiTags('monitoring')
@Controller('monitoring')
export class JobsController {
  constructor(private readonly scheduler: MonitoringScheduler) {}

  @Get('queues')
  queues() {
    return this.scheduler.queueStats();
  }

  @Post('enqueue')
  async enqueue(@Body() dto: RunMonitoringDto) {
    const types: MonitoringType[] = dto.type
      ? [dto.type]
      : [MonitoringType.PRICE, MonitoringType.STOCK, MonitoringType.SHIPPING];
    const jobs = [];
    for (const type of types) {
      jobs.push(await this.scheduler.enqueue(type, { productId: dto.productId, force: true }));
    }
    return jobs.map((job) => ({ id: job.id, name: job.name, queue: job.queueName }));
  }
}
