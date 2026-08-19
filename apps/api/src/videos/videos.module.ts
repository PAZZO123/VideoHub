import { Module } from '@nestjs/common';
import { KidsController, VideosController } from './videos.controller';
import { VideosService } from './videos.service';

@Module({
  controllers: [VideosController, KidsController],
  providers: [VideosService],
  exports: [VideosService],
})
export class VideosModule {}
