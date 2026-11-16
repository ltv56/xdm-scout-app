type Req = { method: string; headers: Record<string, string | string[] | undefined> }
type Res = { status(code: number): { json(body: unknown): unknown } }

// Names the API answers to by default: the local machine, and `app` for the other containers of the stack.
const LOCAL = ['localhost', '127.0.0.1', '[::1]', 'app']
const READ = new Set(['GET', 'HEAD', 'OPTIONS'])

export function parseAllowedHosts(extra?: string): string[] {
  const more = (extra ?? '').split(',').map((h) => h.trim().toLowerCase()).filter(Boolean)
  return [...LOCAL, ...more]
}

function hostname(hostHeader: string): string {
  const h = hostHeader.toLowerCase()
  return h.startsWith('[') ? h.slice(0, h.indexOf(']') + 1) : h.split(':')[0]
}

// A foreign Host stops DNS rebinding; a foreign Origin on a write stops another site from driving the API through the operator's browser.
export function createHostGuard(allowed: string[]) {
  const ok = new Set(allowed)
  return (req: Req, res: Res, next: () => void) => {
    const host = req.headers.host as string | undefined
    if (!host || !ok.has(hostname(host))) return void res.status(421).json({ message: 'Unknown host' })
    const origin = req.headers.origin as string | undefined
    if (origin && !READ.has(req.method)) {
      let originHost = ''
      try {
        originHost = new URL(origin).hostname.toLowerCase()
        if (originHost.includes(':')) originHost = `[${originHost.replace(/^\[|\]$/g, '')}]`
      } catch {}
      if (!ok.has(originHost)) return void res.status(403).json({ message: 'Cross-site request refused' })
    }
    next()
  }
}
