import { BadRequestException } from '@nestjs/common'
import { describe, expect, it } from 'vitest'
import { FakeLlmClient } from '../llm/fake-llm-client'
import type { LlmClient, LlmRequest } from '../llm/llm-client'
import { HandleExtractor, MAX_FILE_BYTES } from './handle-extract'

const FILE = [
  'Name,Company,Contact',
  'Mai Tran,Robo Labs,@mai_builds',
  'Budi,Agentic SG,https://x.com/budi_agents',
  'Lena,Embodied VN,twitter.com/Lena_Embodied/status/1',
  'Someone with no handle,Acme,someone@example.com',
].join('\n')

// A model that answers with the given handles and reports token counts the way the HTTP clients do.
function model(handles: string[], tokens = { inputTokens: 3000, outputTokens: 200 }) {
  const calls: LlmRequest[] = []
  const client: LlmClient = {
    model: 'gpt-6-luna',
    async completeJson(req) {
      calls.push(req)
      req.onUsage?.({ model: 'gpt-6-luna', ...tokens })
      return { handles }
    },
  }
  return { client, calls }
}

describe('HandleExtractor', () => {
  it('keeps only handles that are really in the file, once each, with the line they are on', async () => {
    const { client } = model(['mai_builds', '@Budi_agents', 'lena_embodied', 'mai_builds', 'made_up_person'])
    const r = await new HandleExtractor(client).extract(FILE)
    expect(r.handles).toEqual([
      { handle: 'mai_builds', lineNo: 2, line: 'Mai Tran,Robo Labs,@mai_builds' },
      { handle: 'budi_agents', lineNo: 3, line: 'Budi,Agentic SG,https://x.com/budi_agents' },
      { handle: 'lena_embodied', lineNo: 4, line: 'Lena,Embodied VN,twitter.com/Lena_Embodied/status/1' },
    ])
  })

  it('lists the lines where no handle was found, so a person can check nothing was missed', async () => {
    const { client } = model(['mai_builds', 'budi_agents', 'lena_embodied'])
    const r = await new HandleExtractor(client).extract(FILE)
    expect(r.missedLines).toEqual([
      { lineNo: 1, line: 'Name,Company,Contact' },
      { lineNo: 5, line: 'Someone with no handle,Acme,someone@example.com' },
    ])
  })

  it('does not take a word inside an email address or a longer word for a handle', async () => {
    const { client } = model(['example', 'someone', 'robo'])
    const r = await new HandleExtractor(client).extract(FILE)
    expect(r.handles).toEqual([])
  })

  it('says what the read cost: model, tokens in and out, and the price', async () => {
    const { client } = model(['mai_builds'])
    const r = await new HandleExtractor(client).extract(FILE)
    expect(r).toMatchObject({ model: 'gpt-6-luna', inputTokens: 3000, outputTokens: 200, costMicros: 400 })
  })

  it('passes the file to the model as data, never inside the instructions', async () => {
    const { client, calls } = model([])
    await new HandleExtractor(client).extract(FILE)
    expect(calls[0].task).toBe('handles')
    expect(calls[0].system).not.toContain('mai_builds')
    expect(JSON.parse(calls[0].user)).toEqual({ file: FILE })
  })

  it('refuses a file over 50 KB before calling the model', async () => {
    const { client, calls } = model([])
    await expect(new HandleExtractor(client).extract('a'.repeat(MAX_FILE_BYTES + 1))).rejects.toBeInstanceOf(BadRequestException)
    expect(calls).toHaveLength(0)
  })

  it('estimates tokens and price before the read, from the length of the file', () => {
    const { client } = model([])
    const e = new HandleExtractor(client).estimate(FILE)
    expect(e.model).toBe('gpt-6-luna')
    expect(e.inputTokens).toBeGreaterThan(FILE.length / 4)
    expect(e.costMicros).toBeGreaterThan(0)
  })

  it('without a model key finds handles by pattern and costs nothing', async () => {
    const extractor = new HandleExtractor(new FakeLlmClient(() => ({})))
    expect(extractor.estimate(FILE)).toMatchObject({ model: null, costMicros: 0 })
    const r = await extractor.extract(FILE)
    expect(r.handles.map((h) => h.handle)).toEqual(['mai_builds', 'budi_agents', 'lena_embodied'])
    expect(r).toMatchObject({ model: null, inputTokens: 0, outputTokens: 0, costMicros: 0 })
  })
})
