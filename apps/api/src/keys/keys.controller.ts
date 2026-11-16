import { BadRequestException, Body, Controller, Get, HttpCode, Inject, Post, Put } from '@nestjs/common'
import { DataSource } from 'typeorm'
import { ActivityLog } from '../activity/activity-log.entity'
import { SenderAccount } from '../sending/entities'
import { KEYS_ENV, KeyStore } from './key-store'
import { keysBody, type KeyName, type KeysPage } from './contract'

const LABEL: Record<KeyName, string> = { xClientId: 'X client ID', xClientSecret: 'X client secret', openaiApiKey: 'OpenAI key' }

type Env = { get(key: string, defaultValue?: string): string | undefined }

// The Keys page: the operator brings their own X app and OpenAI key. Keys go in, never come back out.
@Controller('keys')
export class KeysController {
  constructor(
    private readonly ds: DataSource,
    private readonly keys: KeyStore,
    @Inject(KEYS_ENV) private readonly env: Env,
  ) {}

  @Get()
  page(): KeysPage {
    return {
      keys: this.keys.view(),
      callbackUrl: this.env.get('X_REDIRECT_URI', 'http://localhost:3000/api/auth/x/callback') ?? '',
      canSave: !!this.env.get('TOKEN_KEY', ''),
    }
  }

  @Put()
  async save(@Body() body: unknown): Promise<KeysPage> {
    const r = keysBody.safeParse(body)
    if (!r.success) throw new BadRequestException('Only the X client ID, the X client secret and the OpenAI key can be saved, each up to 300 characters.')
    await this.keys.save(r.data).catch((err: Error) => {
      throw new BadRequestException(err.message)
    })
    const names = Object.entries(r.data) as [KeyName, string][]
    const saved = names.filter(([, v]) => v.trim()).map(([k]) => LABEL[k])
    const cleared = names.filter(([, v]) => !v.trim()).map(([k]) => LABEL[k])
    const detail = [saved.length && `Saved: ${saved.join(', ')}`, cleared.length && `Cleared: ${cleared.join(', ')}`].filter(Boolean).join('. ')
    if (detail) await this.ds.getRepository(ActivityLog).save({ kind: 'keys_changed', subject: 'keys', detail })
    return this.page()
  }

  // For when the evaluation is over: drops the saved keys and the X account's tokens in one go.
  @Post('forget')
  @HttpCode(200)
  async forget(): Promise<KeysPage> {
    await this.keys.forgetAll()
    await this.ds.createQueryBuilder().update(SenderAccount).set({ accessTokenEnc: null, refreshTokenEnc: null, tokenExpiresAt: null }).execute()
    await this.ds.getRepository(ActivityLog).save({ kind: 'keys_forgotten', subject: 'keys', detail: 'Saved keys and X account tokens removed' })
    return this.page()
  }
}
