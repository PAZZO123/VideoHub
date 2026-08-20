import { Injectable } from '@nestjs/common';
import type {
  ExternalVideo,
  VideoCatalogueProvider,
} from '../video-catalogue.interface';

/**
 * No external catalogue.
 *
 * The default. A deployment that wants only its own uploads sets
 * VIDEO_CATALOGUE_PROVIDER=none and never talks to a third party — which is
 * also what the test suite runs against, so no test reaches the network.
 */
@Injectable()
export class NoneCatalogueProvider implements VideoCatalogueProvider {
  readonly name = 'none';

  async search(): Promise<ExternalVideo[]> {
    return [];
  }

  async getById(): Promise<ExternalVideo | null> {
    return null;
  }
}
