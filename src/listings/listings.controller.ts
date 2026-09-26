import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Listing } from '@prisma/client';
import { CreateListingDto, ListListingsQueryDto, UpdateListingDto } from './dto/listing.dto';
import { ListingsService } from './listings.service';
import { ListingView } from './listings.types';

@ApiTags('listings')
@Controller('listings')
export class ListingsController {
  constructor(private readonly listingsService: ListingsService) {}

  @Get()
  findAll(@Query() query: ListListingsQueryDto): Promise<ListingView[]> {
    return this.listingsService.findAll(query);
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

  @Delete(':id')
  remove(@Param('id') id: string): Promise<Listing> {
    return this.listingsService.remove(id);
  }
}
