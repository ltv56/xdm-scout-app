import type { NestExpressApplication } from '@nestjs/platform-express'

// Serves the built web app from the API process; the app only ever asks for /api, so there is no page routing to fall back to.
export function serveWeb(app: NestExpressApplication, dist: string): void {
  app.useStaticAssets(dist)
}
