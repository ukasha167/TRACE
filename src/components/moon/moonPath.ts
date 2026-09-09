import { Skia } from "@shopify/react-native-skia";
import { terminatorSemiAxis } from "@/lib/astronomy/moonLighting";

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
  // Shared with the shader rather than restated here. Both renderers draw the
  // same terminator or one of them is wrong, and the failure mode is a moon
  // whose phase depends on which screen you are looking at.
  const b = r * terminatorSemiAxis(phaseFraction);
  const isGibbous = phaseFraction > 0.5;
  const builder = Skia.PathBuilder.Make();

  if (isWaxing) {
    // Waxing: lit limb on the RIGHT
    builder.arcToOval(
      { x: cx - r, y: cy - r, width: r * 2, height: r * 2 },
      -90,
      180,
      true
    );
    // Terminator: bottom -> top.
    // Through left (-b) if gibbous, right (+b) if crescent.
    builder.arcToOval(
      { x: cx - b, y: cy - r, width: b * 2, height: r * 2 },
      90,
      isGibbous ? 180 : -180,
      false
    );
  } else {
    // Waning: lit limb on the LEFT
    builder.arcToOval(
      { x: cx - r, y: cy - r, width: r * 2, height: r * 2 },
      -90,
      -180,
      true
    );
    // Terminator: bottom -> top.
    // Through right (+b) if gibbous, left (-b) if crescent.
    builder.arcToOval(
      { x: cx - b, y: cy - r, width: b * 2, height: r * 2 },
      90,
      isGibbous ? -180 : 180,
      false
    );
  }

  // detach() rather than build(): the builder is finished with, and detaching
  // hands over its buffers instead of copying them. This path is rebuilt on
  // every phase change.
  return builder.close().detach();
}

export function moonDiscPath(cx: number, cy: number, r: number) {
  return Skia.Path.Circle(cx, cy, r);
}
