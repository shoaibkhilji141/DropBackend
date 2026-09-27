import { Module } from '@nestjs/common';
import { AliExpressModule } from '../integrations/aliexpress/aliexpress.module';
import { OpenAIModule } from '../integrations/openai/openai.module';
import { ProfitModule } from '../profit/profit.module';
import { UsersModule } from '../users/users.module';
import { AiController } from './ai.controller';
import { AiService } from './ai.service';

@Module({
  imports: [OpenAIModule, AliExpressModule, ProfitModule, UsersModule],
  controllers: [AiController],
  providers: [AiService],
  exports: [AiService],
})
export class AiModule {}
