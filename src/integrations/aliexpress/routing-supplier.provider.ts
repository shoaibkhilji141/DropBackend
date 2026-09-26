import { Injectable, Logger } from '@nestjs/common';
import { AliExpressApiProvider } from './aliexpress-api.provider';
import {
  SupplierProduct,
  SupplierProductProvider,
  SupplierSearchQuery,
  SupplierSearchResult,
} from './aliexpress.types';
import { LocalAliExpressProvider } from './local-aliexpress.provider';

/**
 * Uses the official AliExpress APIs when a seller is connected. Falls back to
 * the local catalog so research/monitoring keep working before OAuth.
 */
@Injectable()
export class RoutingSupplierProvider implements SupplierProductProvider {
  readonly name = 'aliexpress';
  private readonly logger = new Logger(RoutingSupplierProvider.name);

  constructor(
    private readonly live: AliExpressApiProvider,
    private readonly local: LocalAliExpressProvider,
  ) {}

  isConfigured(): boolean {
    return this.live.isConfigured() || this.local.isConfigured();
  }

  async search(query: SupplierSearchQuery): Promise<SupplierSearchResult> {
    if (await this.live.hasLiveSession()) {
      return this.live.search(query);
    }
    return this.local.search(query);
  }

  async getByExternalId(externalId: string): Promise<SupplierProduct | null> {
    if (await this.live.hasLiveSession()) {
      try {
        return await this.live.getByExternalId(externalId);
      } catch (error) {
        this.logger.warn(
          `Live AliExpress lookup failed for ${externalId}: ${
            error instanceof Error ? error.message : error
          }`,
        );
        throw error;
      }
    }
    return this.local.getByExternalId(externalId);
  }
}
