import { Controller, Get, Param, Post, Query, Res } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { CurrentUser } from '../auth/current-user.decorator';
import { Public } from '../auth/public.decorator';
import { AuthenticatedUser } from '../auth/jwt.strategy';
import { ConnectionsOverview, ConnectionsService } from './connections.service';
import { MarketplaceConnectionView } from '../integrations/marketplace/marketplace.types';
import { MarketplaceStatus } from '../integrations/ebay/ebay.service';

@ApiTags('connections')
@Controller('connections')
export class ConnectionsController {
  constructor(private readonly connectionsService: ConnectionsService) {}

  @Get()
  overview(@CurrentUser() user?: AuthenticatedUser): Promise<ConnectionsOverview> {
    return this.connectionsService.getOverview(user);
  }

  @Get('ebay')
  async ebay(@CurrentUser() user?: AuthenticatedUser): Promise<MarketplaceStatus> {
    return (await this.connectionsService.getOverview(user)).ebay;
  }

  @Get('aliexpress')
  async aliexpress(@CurrentUser() user?: AuthenticatedUser): Promise<MarketplaceConnectionView> {
    return (await this.connectionsService.getOverview(user)).aliexpress;
  }

  @Post(':platform/connect')
  start(
    @Param('platform') platform: 'ebay' | 'aliexpress',
    @CurrentUser() user?: AuthenticatedUser,
  ): Promise<{ url: string }> {
    return this.connectionsService.startUrl(platform, user);
  }

  @Post(':platform/disconnect')
  disconnect(
    @Param('platform') platform: 'ebay' | 'aliexpress',
    @CurrentUser() user?: AuthenticatedUser,
  ) {
    return this.connectionsService.disconnect(platform, user);
  }

  @Public()
  @Get(':platform/callback')
  async callback(
    @Param('platform') platform: 'ebay' | 'aliexpress',
    @Query('code') code: string | undefined,
    @Query('state') state: string | undefined,
    @Query('error') error: string | undefined,
    @Res() response: Response,
  ): Promise<void> {
    const url = await this.connectionsService.handleCallback(platform, code, state, error);
    response.redirect(url);
  }
}
