import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Controller, Get } from '@nestjs/common'
import type { NestExpressApplication } from '@nestjs/platform-express'
import { Test } from '@nestjs/testing'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { serveWeb } from './serve-web'

@Controller('health')
class Health {
  @Get()
  get() {
    return { status: 'ok' }
  }
}

let app: NestExpressApplication
let base: string

beforeAll(async () => {
  const dist = mkdtempSync(join(tmpdir(), 'xdm-web-'))
  writeFileSync(join(dist, 'index.html'), '<title>xdm-scout</title>')
  writeFileSync(join(dist, 'app.js'), 'console.log(1)')
  const module = await Test.createTestingModule({ controllers: [Health] }).compile()
  app = module.createNestApplication<NestExpressApplication>()
  app.setGlobalPrefix('api')
  serveWeb(app, dist)
  await app.listen(0)
  base = await app.getUrl()
})

afterAll(async () => {
  await app?.close()
})

describe('serveWeb', () => {
  it('serves the built page at / and its files, and leaves /api to the controllers', async () => {
    expect(await (await fetch(`${base}/`)).text()).toContain('<title>xdm-scout</title>')
    expect(await (await fetch(`${base}/app.js`)).text()).toBe('console.log(1)')
    expect(await (await fetch(`${base}/api/health`)).json()).toEqual({ status: 'ok' })
  })

  it('answers 404 for an API route that does not exist, not the page', async () => {
    const res = await fetch(`${base}/api/nothing`)
    expect(res.status).toBe(404)
    expect(res.headers.get('content-type')).toContain('json')
  })
})
