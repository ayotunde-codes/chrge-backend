import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { StationsService } from './stations.service';
import { StationsController } from './stations.controller';
import { FavoritesController } from './favorites.controller';
import { HandleService } from './handle.service';
import { VehiclesModule } from '../vehicles/vehicles.module';

@Module({
  imports: [ConfigModule, VehiclesModule],
  controllers: [StationsController, FavoritesController],
  providers: [StationsService, HandleService],
  exports: [StationsService],
})
export class StationsModule {}
