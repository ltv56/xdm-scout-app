import 'reflect-metadata'
import { NestFactory } from '@nestjs/core'
import type { NestExpressApplication } from '@nestjs/platform-express'
import { DataSource } from 'typeorm'
import { AppModule } from './app.module'
import { SandboxReload } from './sandbox/sandbox-reset'
import { serveWeb } from './serve-web'
import { FakeXClient } from './x/fake-x-client'
import { X_CLIENT } from './x/x-client'

const RELOAD_EVERY_MS = 5_000

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule)
  app.setGlobalPrefix('api')
  // Set only in the Docker image, where one process serves the API and the built web app.
  if (process.env.WEB_DIST) serveWeb(app, process.env.WEB_DIST)
  await app.listen(process.env.PORT ?? 3001)
  // A sandbox reset empties the database; this process forgets what its fake X saw too.
  const x = app.get(X_CLIENT)
  if (x instanceof FakeXClient) {
    const reload = new SandboxReload(app.get(DataSource), x)
    setInterval(() => void reload.check().then((done) => done && console.log('sandbox reset seen: fake X fixtures reloaded')).catch((err: unknown) => console.error('sandbox reload failed', err)), RELOAD_EVERY_MS)
  }
}

void bootstrap()
