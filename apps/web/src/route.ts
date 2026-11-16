// The open page lives in the URL hash (#<campaign>/<page>[/<messages tab>]), so a reload or a shared link opens the same place.
export interface Route {
  campaignId: number | null
  page: string | null
  sub: string | null
}

// The campaign may be left out (#profile, as the X login sends you back).
export function readRoute(hash = window.location.hash): Route {
  const parts = hash.replace(/^#\/?/, '').split('/')
  const id = Number(parts[0])
  const hasCampaign = Number.isInteger(id) && id > 0
  const [page, sub] = hasCampaign ? parts.slice(1) : parts
  return { campaignId: hasCampaign ? id : null, page: page || null, sub: sub || null }
}

export function writeRoute(campaignId: number | null, page: string, sub?: string) {
  const hash = campaignId === null ? '' : `#${[campaignId, page, sub].filter(Boolean).join('/')}`
  if (window.location.hash !== hash) window.history.replaceState(null, '', hash || window.location.pathname)
}
