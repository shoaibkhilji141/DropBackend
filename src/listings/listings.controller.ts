import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Listing } from '@prisma/client';
import { IsBoolean } from 'class-validator';
import { CurrentUser } from '../auth/current-user.decorator';
import { AuthenticatedUser } from '../auth/jwt.strategy';
import { CreateListingDto, ListListingsQueryDto, UpdateListingDto } from './dto/listing.dto';
import { ListingsService } from './listings.service';
import { ListingView } from './listings.types';

class AutoUpdateDto {
  @IsBoolean()
  enabled: boolean;
}

@ApiTags('listings')
@Controller('listings')
export class ListingsController {
  constructor(private readonly listingsService: ListingsService) {}

  @Get()
  findAll(
    @Query() query: ListListingsQueryDto,
    @CurrentUser() user?: AuthenticatedUser,
  ): Promise<ListingView[]> {
    return this.listingsService.findAll(query, user);
  }

  @Get(':id')
  findOne(@Param('id') id: string): Promise<ListingView> {
    return this.listingsService.findOne(id);
  }

  @Post()
  create(@Body() dto: CreateListingDto): Promise<ListingView> {
    return this.listingsService.create(dto);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateListingDto): Promise<ListingView> {
    return this.listingsService.update(id, dto);
  }

  @Post(':id/publish')
  publish(
    @Param('id') id: string,
    @CurrentUser() user?: AuthenticatedUser,
  ): Promise<ListingView> {
    return this.listingsService.publish(id, user);
  }

  @Patch(':id/auto-update')
  autoUpdate(@Param('id') id: string, @Body() dto: AutoUpdateDto): Promise<ListingView> {
    return this.listingsService.setAutoUpdate(id, dto.enabled);
  }

  @Delete(':id')
  remove(@Param('id') id: string): Promise<Listing> {
    return this.listingsService.remove(id);
  }
}
