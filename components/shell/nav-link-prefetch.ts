/**
 * Spread onto a sidebar / phone tab `<Link>`: hovering or touching it fetches the whole page ahead
 * of the click (needs `experimental.dynamicOnHover` in next.config.ts). The App Router Link takes
 * this prop, but typedRoutes' generated Link types leave it out, so it goes in by spread.
 */
export const PREFETCH_PAGE_ON_HOVER = { unstable_dynamicOnHover: true } as const;
