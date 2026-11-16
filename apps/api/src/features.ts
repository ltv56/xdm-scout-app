import { Controller, Get, Inject } from '@nestjs/common'
import type { Features } from './feature-flags'

export const FEATURES = Symbol('FEATURES')

@Controller('features')
export class FeaturesController {
  constructor(@Inject(FEATURES) private readonly features: Features) {}

  @Get()
  get(): Features {
    return this.features
  }
}
