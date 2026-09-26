import { Injectable, Logger } from '@nestjs/common';
import { IntegrationAccount, LinkStatus, Platform } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { parseStringArray } from '../../common/json';
import { OAuthTokenSet } from '../marketplace/marketplace.types';

export type PublicAccount = Omit<IntegrationAccount, 'accessToken' | 'refreshToken'>;

@Injectable()
export class IntegrationAccountsService {
  private readonly logger = new Logger(IntegrationAccountsService.name);

  constructor(private readonly prisma: PrismaService) {}

  async find(userId: string, platform: Platform): Promise<IntegrationAccount | null> {
    return this.prisma.integrationAccount.findUnique({
      where: { userId_platform: { userId, platform } },
    });
  }

  async findConnected(platform: Platform): Promise<IntegrationAccount | null> {
    return this.prisma.integrationAccount.findFirst({
      where: { platform, status: LinkStatus.CONNECTED, accessToken: { not: null } },
      orderBy: { updatedAt: 'desc' },
    });
  }

  toPublic(account: IntegrationAccount | null): PublicAccount | null {
    if (!account) return null;
    const { accessToken: _access, refreshToken: _refresh, ...safe } = account;
    return safe;
  }

  async upsertTokens(
    userId: string,
    platform: Platform,
    tokens: OAuthTokenSet,
    profile?: { displayName?: string; email?: string; externalUserId?: string },
  ): Promise<PublicAccount> {
    const account = await this.prisma.integrationAccount.upsert({
      where: { userId_platform: { userId, platform } },
      create: {
        userId,
        platform,
        status: LinkStatus.CONNECTED,
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        tokenExpiresAt: tokens.expiresAt,
        scopes: tokens.scopes,
        displayName: profile?.displayName,
        accountEmail: profile?.email,
        externalUserId: profile?.externalUserId,
        lastError: null,
      },
      update: {
        status: LinkStatus.CONNECTED,
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken ?? undefined,
        tokenExpiresAt: tokens.expiresAt,
        scopes: tokens.scopes,
        displayName: profile?.displayName,
        accountEmail: profile?.email,
        externalUserId: profile?.externalUserId,
        lastError: null,
      },
    });
    this.logger.log(`${platform} account connected for user ${userId}`);
    return this.toPublic(account) as PublicAccount;
  }

  async markError(userId: string, platform: Platform, message: string): Promise<void> {
    await this.prisma.integrationAccount.upsert({
      where: { userId_platform: { userId, platform } },
      create: { userId, platform, status: LinkStatus.ERROR, lastError: message },
      update: { status: LinkStatus.ERROR, lastError: message },
    });
  }

  async disconnect(userId: string, platform: Platform): Promise<PublicAccount | null> {
    const existing = await this.find(userId, platform);
    if (!existing) return null;
    const account = await this.prisma.integrationAccount.update({
      where: { id: existing.id },
      data: {
        status: LinkStatus.DISCONNECTED,
        accessToken: null,
        refreshToken: null,
        tokenExpiresAt: null,
        lastError: null,
      },
    });
    return this.toPublic(account);
  }

  async setCapabilities(userId: string, platform: Platform, methods: string[]): Promise<void> {
    await this.prisma.integrationAccount.updateMany({
      where: { userId, platform },
      data: { capabilities: JSON.stringify(methods) },
    });
  }

  capabilitiesOf(account: IntegrationAccount | null): string[] {
    return parseStringArray(account?.capabilities ?? null);
  }

  isExpired(account: IntegrationAccount | null, skewMs = 60_000): boolean {
    if (!account?.tokenExpiresAt) return false;
    return account.tokenExpiresAt.getTime() <= Date.now() + skewMs;
  }
}
