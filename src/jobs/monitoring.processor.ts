import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { MonitoringType } from '@prisma/client';
import { Job } from 'bullmq';
import { MonitoringService } from '../monitoring/monitoring.service';
import {
  QUEUE_PRICE_MONITORING,
  QUEUE_SHIPPING_MONITORING,
  QUEUE_STOCK_MONITORING,
} from './queues';

interface MonitoringJobData {
  ruleId?: string;
  productId?: string;
  force?: boolean;
}

abstract class MonitoringProcessor extends WorkerHost {
  protected readonly logger = new Logger(this.constructor.name);

  constructor(
    protected readonly monitoring: MonitoringService,
    private readonly type: MonitoringType,
  ) {
    super();
  }

  async process(job: Job<MonitoringJobData>): Promise<unknown> {
    this.logger.log(`Processing ${this.type} job ${job.name} (${job.id})`);
    try {
      if (job.name === 'check' && job.data.ruleId) {
        return await this.monitoring.checkRule(job.data.ruleId);
      }
      return await this.monitoring.processDue(this.type, {
        productId: job.data.productId,
        force: job.data.force,
      });
    } catch (error) {
      this.logger.error(
        `${this.type} job ${job.id} failed: ${error instanceof Error ? error.message : error}`,
      );
      throw error;
    }
  }
}

@Processor(QUEUE_PRICE_MONITORING, { concurrency: 2 })
export class PriceMonitoringProcessor extends MonitoringProcessor {
  constructor(monitoring: MonitoringService) {
    super(monitoring, MonitoringType.PRICE);
  }
}

@Processor(QUEUE_STOCK_MONITORING, { concurrency: 2 })
export class StockMonitoringProcessor extends MonitoringProcessor {
  constructor(monitoring: MonitoringService) {
    super(monitoring, MonitoringType.STOCK);
  }
}

@Processor(QUEUE_SHIPPING_MONITORING, { concurrency: 2 })
export class ShippingMonitoringProcessor extends MonitoringProcessor {
  constructor(monitoring: MonitoringService) {
    super(monitoring, MonitoringType.SHIPPING);
  }
}
