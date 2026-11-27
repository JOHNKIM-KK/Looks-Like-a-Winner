import Phaser from "phaser";
import {
  SPECS,
  eventKey,
  jsonKey,
  maskKey,
  overlayKey,
  parseSheet,
  type EventSheet,
  type EventSheetId,
  type EventSheets,
  type RawSheet,
} from "./eventSheets";
import { bakeOverlay } from "./horseCoat";
import { addRowFrames } from "./spriteFrames";

function runLoader(scene: Phaser.Scene, queue: () => void): Promise<void> {
  return new Promise((resolve) => {
    queue();
    scene.load.once(Phaser.Loader.Events.COMPLETE, () => resolve());
    scene.load.start();
  });
}

/** Loads the sheets, bakes lane overlays from their masks, and frees the masks. */
export async function loadEventSheets(scene: Phaser.Scene, ids: readonly EventSheetId[]): Promise<EventSheets> {
  const sheets: EventSheets = {};
  if (ids.length === 0) return sheets;
  await runLoader(scene, () => {
    for (const id of ids) scene.load.json(jsonKey(id), `${SPECS[id].dir}/${SPECS[id].name}.json`);
  });
  for (const id of ids) {
    const raw = scene.cache.json.get(jsonKey(id)) as RawSheet | undefined;
    scene.cache.json.remove(jsonKey(id));
    if (raw) sheets[id] = parseSheet(id, raw);
  }
  const loaded = Object.values(sheets);
  await runLoader(scene, () => {
    for (const sheet of loaded) {
      const { dir, overlay } = SPECS[sheet.id];
      for (const set of ["straight", "corner"] as const) {
        for (const angle of sheet.sets[set]) {
          scene.load.image(eventKey(sheet.id, set, angle.index), `${dir}/${angle.colorFile}`);
          if (overlay && angle.maskFile) scene.load.image(maskKey(sheet.id, set, angle.index), `${dir}/${angle.maskFile}`);
        }
      }
    }
  });
  for (const sheet of loaded) {
    const paint = SPECS[sheet.id].overlay;
    for (const set of ["straight", "corner"] as const) {
      for (const angle of sheet.sets[set]) {
        const color = eventKey(sheet.id, set, angle.index);
        addRowFrames(scene.textures.get(color), sheet.frames, angle.frameW, angle.frameH);
        const lane = overlayKey(sheet.id, set, angle.index);
        if (!paint || !lane) continue;
        const mask = maskKey(sheet.id, set, angle.index);
        bakeOverlay(scene, { key: lane, colorKey: color, maskKey: mask, frames: sheet.frames, frameW: angle.frameW, frameH: angle.frameH, paint });
        scene.textures.remove(mask);
      }
    }
  }
  return sheets;
}

function eventTextureKeys(sheet: EventSheet) {
  const keys: string[] = [];
  for (const set of ["straight", "corner"] as const) {
    for (const angle of sheet.sets[set]) {
      keys.push(eventKey(sheet.id, set, angle.index));
      const lane = overlayKey(sheet.id, set, angle.index);
      if (lane) keys.push(lane);
    }
  }
  return keys;
}

export function removeEventTextures(scene: Phaser.Scene, sheets: EventSheets) {
  for (const sheet of Object.values(sheets)) {
    for (const key of eventTextureKeys(sheet)) if (scene.textures.exists(key)) scene.textures.remove(key);
  }
}

/** GPU bytes the sheet holds: width x height x 4 of every texture it left behind. */
export function eventTextureBytes(scene: Phaser.Scene, sheet: EventSheet) {
  let bytes = 0;
  for (const key of eventTextureKeys(sheet)) {
    if (!scene.textures.exists(key)) continue;
    const image = scene.textures.get(key).getSourceImage() as { width: number; height: number };
    bytes += image.width * image.height * 4;
  }
  return bytes;
}

