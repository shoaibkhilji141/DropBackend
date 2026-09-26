import { AlertSeverity, AlertType, MonitoringType, Prisma } from '@prisma/client';

export type MonitoringRuleRecord = Prisma.MonitoringRuleGetPayload<{
  include: { product: true };
}>;

export interface MonitoringRuleView {
  id: string;
  productId: string;
  type: MonitoringType;
  threshold: number | null;
  intervalMinutes: number;
  enabled: boolean;
  lastRunAt: string | null;
  nextRunAt: string | null;
  lastError: string | null;
  lastStatus: string | null;
  product: { id: string; title: string } | null;
}

export interface PriceSnapshot {
  productId: string;
  title: string;
  enabled: boolean;
  intervalMinutes: number;
  lastChecked: string | null;
  nextCheck: string | null;
  lastError: string | null;
  lastStatus: string | null;
  currentPrice: number;
  previousPrice: number | null;
  change: number | null;
  changePercent: number | null;
  currency: string;
}

export interface StockSnapshot {
  productId: string;
  title: string;
  enabled: boolean;
  intervalMinutes: number;
  lastChecked: string | null;
  nextCheck: string | null;
  lastError: string | null;
  lastStatus: string | null;
  currentStock: number;
  previousStock: number | null;
  change: number | null;
  status: 'IN_STOCK' | 'LOW' | 'OUT_OF_STOCK';
}

export interface ShippingSnapshot {
  productId: string;
  title: string;
  enabled: boolean;
  intervalMinutes: number;
  lastChecked: string | null;
  nextCheck: string | null;
  lastError: string | null;
  lastStatus: string | null;
  available: boolean;
  method: string | null;
  currentCost: number | null;
  previousCost: number | null;
  previousMethod: string | null;
  change: number | null;
}

export interface AlertView {
  id: string;
  type: AlertType;
  severity: AlertSeverity;
  message: string;
  readAt: string | null;
  createdAt: string;
  product: { id: string; title: string } | null;
}

export interface QueueStats {
  name: string;
  waiting: number;
  active: number;
  delayed: number;
  failed: number;
  completed: number;
}

export interface MonitoringOverview {
  redisEnabled: boolean;
  redisConnected: boolean;
  rulesEnabled: number;
  rulesTotal: number;
  unreadAlerts: number;
  lastChecked: string | null;
  failedRules: number;
  queues: QueueStats[];
  recentAlerts: AlertView[];
}

export interface CheckResult {
  ruleId: string;
  type: MonitoringType;
  productId: string;
  changed: boolean;
  alertsCreated: number;
}
