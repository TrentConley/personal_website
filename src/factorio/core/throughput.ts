import type { BeltTier } from "./types";

export const BELTS: Record<
  BeltTier,
  {
    id: BeltTier;
    label: string;
    entityName: "transport-belt" | "fast-transport-belt" | "express-transport-belt";
    splitterEntityName: "splitter" | "fast-splitter" | "express-splitter";
    itemsPerSecond: number;
  }
> = {
  yellow: {
    id: "yellow",
    label: "Yellow belt",
    entityName: "transport-belt",
    splitterEntityName: "splitter",
    itemsPerSecond: 15,
  },
  red: {
    id: "red",
    label: "Red belt",
    entityName: "fast-transport-belt",
    splitterEntityName: "fast-splitter",
    itemsPerSecond: 30,
  },
  blue: {
    id: "blue",
    label: "Blue belt",
    entityName: "express-transport-belt",
    splitterEntityName: "express-splitter",
    itemsPerSecond: 45,
  },
};
