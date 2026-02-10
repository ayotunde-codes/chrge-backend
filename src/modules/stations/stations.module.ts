import { Module } from '@nestjs/common';
import { StationsService } from './stations.service';
import { StationsController } from './stations.controller';
import { FavoritesController } from './favorites.controller';
import { VehiclesModule } from '../vehicles/vehicles.module';

@Module({
  imports: [VehiclesModule],
  controllers: [StationsController, FavoritesController],
  providers: [StationsService],
  exports: [StationsService],
})
export class StationsModule {}
