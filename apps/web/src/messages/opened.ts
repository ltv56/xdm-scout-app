// Opening again must not put the draft in the box a second time: it may already be sent.
export function withoutText(url: string) {
  return url.replace(/[?&]text=[^&]*/, '')
}
