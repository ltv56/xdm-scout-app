import 'reflect-metadata'
import { BadRequestException } from '@nestjs/common'
import { describe, expect, it } from 'vitest'
import type { LlmClient } from '../llm/llm-client'
import { HandleExtractor } from './handle-extract'
import { KnownListController } from './known-list.controller'
import type { KnownListService } from './known-list.service'

const llm: LlmClient = { model: 'gpt-6-luna', completeJson: async () => ({ handles: ['mai_builds'] }) }
const controller = new KnownListController({} as KnownListService, new HandleExtractor(llm))

describe('KnownListController AI read of a file', () => {
  it('estimates the cost of reading a file before the read', () => {
    expect(controller.estimate({ text: 'a,@mai_builds' })).toMatchObject({ model: 'gpt-6-luna' })
  })

  it('reads a file and lists the handles in it', async () => {
    expect((await controller.extract({ text: 'a,@mai_builds' })).handles.map((h) => h.handle)).toEqual(['mai_builds'])
  })

  it('needs the file text', async () => {
    expect(() => controller.estimate({})).toThrow(BadRequestException)
    await expect(controller.extract({ text: 5 })).rejects.toBeInstanceOf(BadRequestException)
  })
})
