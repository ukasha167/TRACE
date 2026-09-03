import { Skia } from "@shopify/react-native-skia";

/**
 * Builds the lit region of the moon as a closed Skia Path.
 *
 * The boundary is two arcs:
 * 1. The illuminated limb (a semicircle of radius r).
 * 2. The terminator (a semi-ellipse with horizontal semi-axis b = r|2f-1|
 *    and vertical semi-axis r).
 *
 * In the unrotated lunar body frame (North Up):
 * - Waxing: lit side is on the RIGHT (+X, Mare Crisium).
 *   Limb: top (0, -r) -> right (+r, 0) -> bottom (0, +r).
 *   Terminator: bottom (0, +r) -> top (0, -r).
 * - Waning: lit side is on the LEFT (-X, Oceanus Procellarum).
 *   Limb: top (0, -r) -> left (-r, 0) -> bottom (0, +r).
 *   Terminator: bottom (0, +r) -> top (0, -r).
 *
 * Geometry:
 * - At quarters (f = 0.5): b = 0 and terminator is a straight vertical line.
 * - At new/full: b = r and terminator coincides with the circular limb.
 *
 * Texture and path are NEVER mirrored with scaleX: -1, because flipping the
 * photograph moves Mare Crisium to the wrong limb. Which side is lit comes
 * directly out of this path construction.
 */
export function litMoonPath(
  cx: number,
  cy: number,
  r: number,
  phaseFraction: number,
  isWaxing: boolean = true
) {
  const b = r * Math.abs(2 * phaseFraction - 1);
  const isGibbous = phaseFraction > 0.5;
  const path = Skia.Path.Make();

  if (isWaxing) {
    // Waxing: lit limb on the RIGHT
    path.arcToOval(
      { x: cx - r, y: cy - r, width: r * 2, height: r * 2 },
      -90,
      180,
      true
    );
    // Terminator: bottom -> top.
    // Through left (-b) if gibbous, right (+b) if crescent.
    path.arcToOval(
      { x: cx - b, y: cy - r, width: b * 2, height: r * 2 },
      90,
      isGibbous ? 180 : -180,
      false
    );
  } else {
    // Waning: lit limb on the LEFT
    path.arcToOval(
      { x: cx - r, y: cy - r, width: r * 2, height: r * 2 },
      -90,
      -180,
      true
    );
    // Terminator: bottom -> top.
    // Through right (+b) if gibbous, left (-b) if crescent.
    path.arcToOval(
      { x: cx - b, y: cy - r, width: b * 2, height: r * 2 },
      90,
      isGibbous ? -180 : 180,
      false
    );
  }

  path.close();
  return path;
}

export function moonDiscPath(cx: number, cy: number, r: number) {
  const path = Skia.Path.Make();
  path.addCircle(cx, cy, r);
  return path;
}
