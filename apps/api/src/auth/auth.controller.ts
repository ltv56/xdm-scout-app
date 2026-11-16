import { BadRequestException, Controller, Get, NotFoundException, Post, Query, Redirect } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { AuthService } from './auth.service'

@Controller('auth/x')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly config: ConfigService,
  ) {}

  @Get('login')
  @Redirect()
  login() {
    return { url: this.auth.loginUrl() }
  }

  @Get('status')
  async status() {
    const mode = this.config.get<string>('X_MODE', 'fake')
    return { mode, ...(await this.auth.status(mode)) }
  }

  @Get('callback')
  @Redirect()
  async callback(@Query('code') code?: string, @Query('state') state?: string) {
    if (!code || !state) throw new BadRequestException('Missing code or state')
    try {
      await this.auth.handleCallback(code, state)
    } catch (err) {
      throw new BadRequestException(err instanceof Error ? err.message : 'OAuth failed')
    }
    // Relative, so it lands on whichever host X sent the browser back to (Vite in dev, the API itself when hosted).
    return { url: '/#profile' }
  }

  // Only with X_MODE=fake: a made-up sender so drafts work without logging in to X.
  @Post('fake')
  async fake() {
    if (this.config.get('X_MODE', 'fake') === 'live') throw new NotFoundException()
    const { handle } = await this.auth.connectFake()
    return { handle }
  }
}
