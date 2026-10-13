const MENU_VIEWPORT_MARGIN_PX = 8;

type Size = { width: number; height: number };

/** Keep a fixed-position menu fully inside the viewport, wherever it was opened. */
export function clampMenuPosition(
  position: { x: number; y: number },
  menu: Size,
  viewport: Size
) {
  const maxX = viewport.width - menu.width - MENU_VIEWPORT_MARGIN_PX;
  const maxY = viewport.height - menu.height - MENU_VIEWPORT_MARGIN_PX;
  return {
    x: Math.max(MENU_VIEWPORT_MARGIN_PX, Math.min(position.x, maxX)),
    y: Math.max(MENU_VIEWPORT_MARGIN_PX, Math.min(position.y, maxY))
  };
}
