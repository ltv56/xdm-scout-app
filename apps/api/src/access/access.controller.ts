import { BadRequestException, Body, Controller, Get, HttpCode, Post, Req, Res } from '@nestjs/common'
import { z } from 'zod'
import { readSessionCookie, SESSION_COOKIE } from './access-guard'
import { AccessService } from './access.service'

const setUpBody = z.object({ invite: z.string().min(1).max(200), password: z.string().max(200) })
const signInBody = z.object({ password: z.string().min(1).max(200) })
const SESSION_MS = 30 * 86_400_000

// The parts of the Express request and response used here.
type Request = { headers: Record<string, string | string[] | undefined>; socket?: { remoteAddress?: string } }
type Response = { cookie(name: string, value: string, opts: Record<string, unknown>): unknown; clearCookie(name: string, opts?: Record<string, unknown>): unknown }

// Behind Caddy the first X-Forwarded-For entry is the visitor; it is only used for the activity log.
function from(req: Request) {
  const forwarded = req.headers['x-forwarded-for']
  const first = (Array.isArray(forwarded) ? forwarded[0] : forwarded)?.split(',')[0]?.trim()
  return first || req.socket?.remoteAddress || undefined
}

function parse<T>(schema: z.ZodType<T>, body: unknown): T {
  const r = schema.safeParse(body)
  if (!r.success) throw new BadRequestException('Fill in every field.')
  return r.data
}

@Controller('access')
export class AccessController {
  constructor(private readonly access: AccessService) {}

  @Get()
  async state(@Req() req: Request) {
    return { ...(await this.access.state()), signedIn: await this.access.verify(readSessionCookie(req.headers.cookie), new Date()) }
  }

  @Post('set-up')
  @HttpCode(200)
  async setUp(@Body() body: unknown, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const { invite, password } = parse(setUpBody, body)
    this.setCookie(res, await this.access.setUp(invite, password, new Date(), from(req)))
    return { ok: true }
  }

  @Post('sign-in')
  @HttpCode(200)
  async signIn(@Body() body: unknown, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const { password } = parse(signInBody, body)
    this.setCookie(res, await this.access.signIn(password, new Date(), from(req)))
    return { ok: true }
  }

  @Post('sign-out')
  @HttpCode(200)
  signOut(@Res({ passthrough: true }) res: Response) {
    res.clearCookie(SESSION_COOKIE, { path: '/' })
    return { ok: true }
  }

  // Behind the guard: only a signed-in owner can void every session.
  @Post('sign-out-everywhere')
  @HttpCode(200)
  async signOutEverywhere(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    await this.access.signOutEverywhere(from(req))
    res.clearCookie(SESSION_COOKIE, { path: '/' })
    return { ok: true }
  }

  // HttpOnly keeps it from page scripts, Secure keeps it off plain HTTP, SameSite=Lax keeps other sites from sending it with their writes.
  private setCookie(res: Response, value: string) {
    res.cookie(SESSION_COOKIE, value, { httpOnly: true, secure: true, sameSite: 'lax', path: '/', maxAge: SESSION_MS })
  }
}
