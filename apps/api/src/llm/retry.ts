// Retry rules copied from the official openai-node SDK: 2 retries on 408, 409, 429, 5xx and dropped connections,
// waiting what the API asks (retry-after-ms, retry-after) or backing off from 0.5 s up to 8 s with jitter.
const MAX_RETRIES = 2
const RETRY_STATUS = (s: number) => s === 408 || s === 409 || s === 429 || s >= 500

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

export function retryDelayMs(headers: Headers | null, retry: number, random = Math.random): number {
  const ms = Number(headers?.get('retry-after-ms'))
  if (Number.isFinite(ms) && ms > 0 && ms < 60_000) return ms
  const after = headers?.get('retry-after')
  if (after) {
    const secs = Number(after)
    const fromHeader = Number.isFinite(secs) ? secs * 1000 : Date.parse(after) - Date.now()
    if (fromHeader > 0 && fromHeader < 60_000) return fromHeader
  }
  return Math.min(500 * 2 ** retry, 8000) * (1 - 0.25 * random())
}

export async function fetchWithRetry(fetchFn: typeof fetch, url: string, init: RequestInit, sleep = wait): Promise<Response> {
  for (let retry = 0; ; retry++) {
    const last = retry === MAX_RETRIES
    let res: Response
    try {
      res = await fetchFn(url, init)
    } catch (err) {
      // A dropped connection is retried; an aborted request (our timeout) is not.
      if (last || !(err instanceof TypeError)) throw err
      await sleep(retryDelayMs(null, retry))
      continue
    }
    if (last || res.ok || !RETRY_STATUS(res.status)) return res
    await sleep(retryDelayMs(res.headers, retry))
  }
}
