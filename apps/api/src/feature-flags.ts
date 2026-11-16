// Parts of the app a deploy can turn off. CALL_POST=off (the hosted deploy) hides the call post lane: nobody can set one.
export type Features = { callPost: boolean }

export const featuresFrom = (env: { get(key: string, defaultValue?: string): string | undefined }): Features => ({
  callPost: env.get('CALL_POST', 'on') !== 'off',
})
