export const SESSION_COOKIE = 'xdm_session'

type Req = { path: string; headers: Record<string, string | string[] | undefined> }
type Res = { status(code: number): { json(body: unknown): unknown } }
type Access = { on: boolean; verify(cookie: string | undefined, now: Date): Promise<boolean> }

// Open without a session: the health check, the calls that sign in, and the web page itself (it shows the sign-in screen).
const OPEN_API = new Set(['/api/health', '/api/access', '/api/access/set-up', '/api/access/sign-in', '/api/access/sign-out'])

export function readSessionCookie(header: string | string[] | undefined): string | undefined {
  const raw = Array.isArray(header) ? header.join('; ') : header
  for (const part of (raw ?? '').split(';')) {
    const [name, ...rest] = part.trim().split('=')
    if (name === SESSION_COOKIE) return rest.join('=')
  }
  return undefined
}

// Every other API call needs a valid session when the gate is on; the worker does not go through HTTP, so it is not affected.
export function createAccessGuard(access: Access) {
  return async (req: Req, res: Res, next: () => void) => {
    // Express routes without regard to letter case, so /API/keys reaches the same handler as /api/keys.
    const path = req.path.toLowerCase()
    if (!access.on || !path.startsWith('/api/') || OPEN_API.has(path)) return next()
    if (await access.verify(readSessionCookie(req.headers.cookie), new Date())) return next()
    res.status(401).json({ message: 'Sign in first.' })
  }
}
