// Ends the X login. Opened as a window by the app: tell the app and close. Opened in the app's own tab: go to Profile.
if (window.opener && !window.opener.closed) {
  window.opener.postMessage({ type: 'x-connected' }, window.location.origin)
  window.close()
} else {
  window.location.replace('/#profile')
}
