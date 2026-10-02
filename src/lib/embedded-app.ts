/**
 * The native InFocus Portal iPhone app opens Portal pages it hasn't rebuilt natively in a web
 * view under its own navigation bar. It sets this cookie on that web view, and the Portal then
 * leaves out its sidebar, header and assistant button (AppShell `embedded`).
 */
export const EMBEDDED_APP_COOKIE = "infocus_embedded";
