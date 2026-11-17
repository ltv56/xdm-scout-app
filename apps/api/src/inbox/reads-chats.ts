// Messages typed in the X app go through X Chat, which the DM API never shows; the app reads them only with the
// sender's Chat keys. Without them, watching or polling a hand-sent chat costs reads that can never find anything.
export const READS_CHATS = Symbol('READS_CHATS')

export const readsChats = (env: { get(k: string, d?: string): string | undefined }) => env.get('X_MODE', 'fake') !== 'live' || !!env.get('XCHAT_KEYS_FILE', '')
