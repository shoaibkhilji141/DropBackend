import { Body, Controller, Get, Param, Patch, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { OrderStatus } from '@prisma/client';
import { ListOrdersQueryDto, UpdateOrderDto } from './dto/order.dto';
import { OrdersService } from './orders.service';
import { OrderView } from './orders.types';

@ApiTags('orders')
@Controller('orders')
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @Get()
  findAll(@Query() query: ListOrdersQueryDto): Promise<OrderView[]> {
    return this.ordersService.findAll(query);
  }

  @Get('summary')
  summary(): Promise<{ status: OrderStatus; count: number }[]> {
    return this.ordersService.summary();
  }

  @Get(':id')
  findOne(@Param('id') id: string): Promise<OrderView> {
    return this.ordersService.findOne(id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateOrderDto): Promise<OrderView> {
    return this.ordersService.update(id, dto);
  }
}
