import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Queue } from 'bullmq';
import { MonitoringOverview, QueueStats } from '../monitoring/monitoring.types';
import {
  QUEUE_PRICE_MONITORING,
  QUEUE_SHIPPING_MONITORING,
  QUEUE_STOCK_MONITORING,
} from './queues';

const TICK_EVERY_MS = 60_000;

@Injectable()
export class MonitoringScheduler implements OnModuleInit {
  private readonly logger = new Logger(MonitoringScheduler.name);

  constructor(
    @InjectQueue(QUEUE_PRICE_MONITORING) private readonly priceQueue: Queue,
    @InjectQueue(QUEUE_STOCK_MONITORING) private readonly stockQueue: Queue,
    @InjectQueue(QUEUE_SHIPPING_MONITORING) private readonly shippingQueue: Queue,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.ensureTick(this.priceQueue, 'price-monitoring-tick');
    await this.ensureTick(this.stockQueue, 'stock-monitoring-tick');
    await this.ensureTick(this.shippingQueue, 'shipping-monitoring-tick');
    this.logger.log('BullMQ monitoring ticks registered (every 60s)');
  }

  async enqueue(type: 'PRICE' | 'STOCK' | 'SHIPPING', data: { productId?: string; force?: boolean }) {
    const queue = this.queueFor(type);
    return queue.add('run', data, {
      attempts: 3,
      backoff: { type: 'exponential', delay: 2000 },
      removeOnComplete: 50,
      removeOnFail: 50,
    });
  }

  async queueStats(): Promise<QueueStats[]> {
    return Promise.all([
      this.stats(this.priceQueue),
      this.stats(this.stockQueue),
      this.stats(this.shippingQueue),
    ]);
  }

  async overviewBase(): Promise<Pick<MonitoringOverview, 'queues'>> {
    return { queues: await this.queueStats() };
  }

  private async ensureTick(queue: Queue, jobId: string): Promise<void> {
    const existing = await queue.getRepeatableJobs();
    const already = existing.some((job) => job.id === jobId || job.name === 'tick');
    if (already) return;
    await queue.add(
      'tick',
      {},
      {
        repeat: { every: TICK_EVERY_MS },
        jobId,
        attempts: 3,
        backoff: { type: 'exponential', delay: 2000 },
        removeOnComplete: 20,
        removeOnFail: 20,
      },
    );
  }

  private queueFor(type: 'PRICE' | 'STOCK' | 'SHIPPING'): Queue {
    if (type === 'PRICE') return this.priceQueue;
    if (type === 'STOCK') return this.stockQueue;
    return this.shippingQueue;
  }

  private async stats(queue: Queue): Promise<QueueStats> {
    const counts = await queue.getJobCounts('waiting', 'active', 'delayed', 'failed', 'completed');
    return {
      name: queue.name,
      waiting: counts.waiting ?? 0,
      active: counts.active ?? 0,
      delayed: counts.delayed ?? 0,
      failed: counts.failed ?? 0,
      completed: counts.completed ?? 0,
    };
  }
}
