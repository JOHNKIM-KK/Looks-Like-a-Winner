import type Phaser from "phaser";

export function frameName(texture: Phaser.Textures.Texture, frame: number) {
  const named = String(frame);
  if (texture.has(named)) return named;
  return "__BASE";
}

export function paintGallop(
  sprite: Phaser.GameObjects.Sprite,
  key: string,
  frame: number,
  anchorX: number,
  anchorY: number,
  frameW: number,
  frameH: number,
  scale: number,
  flip: boolean,
) {
  const texture = sprite.scene.textures.get(key);
  if (!texture || texture.key === "__MISSING") return;
  sprite.setTexture(key, frameName(texture, frame));
  const safeW = frameW || 1;
  const safeH = frameH || 1;
  // Phaser mirrors flipX about the frame center, not the origin. The mirrored origin keeps the anchor pixel on the sprite position.
  sprite.setOrigin((flip ? safeW - anchorX : anchorX) / safeW, anchorY / safeH);
  sprite.setScale(scale);
  sprite.setFlipX(flip);
}

/** Names the frames of a single-row sheet "0".."n-1", so every sheet draws through `paintGallop`. */
export function addRowFrames(texture: Phaser.Textures.Texture | undefined, frames: number, frameW: number, frameH: number) {
  if (!texture || texture.key === "__MISSING") return;
  for (let index = 0; index < frames; index += 1) {
    if (!texture.has(String(index))) texture.add(String(index), 0, index * frameW, 0, frameW, frameH);
  }
}
