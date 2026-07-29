import { strFromU8, strToU8, unzlibSync, zlibSync } from "fflate";
import type { BlueprintDocument } from "./types";

const BLUEPRINT_PREFIX = "0";

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }
  return btoa(binary);
}

function base64ToBytes(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

export function encodeBlueprint(document: BlueprintDocument): string {
  const compressed = zlibSync(strToU8(JSON.stringify(document)), { level: 9 });
  return BLUEPRINT_PREFIX + bytesToBase64(compressed);
}

export function decodeBlueprint(value: string): BlueprintDocument {
  const trimmed = value.trim();
  if (!trimmed.startsWith(BLUEPRINT_PREFIX)) {
    throw new Error("Factorio blueprint strings must start with the version byte 0.");
  }
  try {
    const json = strFromU8(unzlibSync(base64ToBytes(trimmed.slice(1))));
    const parsed = JSON.parse(json) as BlueprintDocument;
    if (!parsed.blueprint || parsed.blueprint.item !== "blueprint") {
      throw new Error("Decoded data is not a Factorio blueprint.");
    }
    return parsed;
  } catch (error) {
    if (error instanceof Error && error.message.includes("not a Factorio")) throw error;
    throw new Error("Blueprint payload is not valid base64/zlib JSON.", { cause: error });
  }
}
