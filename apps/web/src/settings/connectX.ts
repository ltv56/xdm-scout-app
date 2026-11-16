// The X login opens in its own window, so the app's tab keeps no X page in its history (Back stays in the app).
// A blocked pop-up falls back to the same tab, which ends on Profile.
export const X_LOGIN = '/api/auth/x/login'

export function connectX(e: { preventDefault(): void }) {
  const w = window.open(X_LOGIN, 'x-login', 'popup,width=600,height=760')
  if (w) e.preventDefault()
}

// The window that ends the login (public/x-connected.js) says so; the app then reads the account again.
export function onXConnected(handler: () => void) {
  const listener = (e: MessageEvent) => {
    if (e.origin === window.location.origin && (e.data as { type?: string } | null)?.type === 'x-connected') handler()
  }
  window.addEventListener('message', listener)
  return () => window.removeEventListener('message', listener)
}
