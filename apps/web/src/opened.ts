// Hand-offs opened in X on this browser, so the next step stays "Sent?" after a reload. Lost with the site data, which only resets the step.
const key = (draftId: number) => `xdm.opened.${draftId}`

export function wasOpened(draftId: number): boolean {
  try {
    return localStorage.getItem(key(draftId)) === '1'
  } catch {
    return false
  }
}

export function markOpened(draftId: number) {
  try {
    localStorage.setItem(key(draftId), '1')
  } catch {
    // No storage here: the row just goes back to Open chat on a reload.
  }
}
