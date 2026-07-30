import type {
  ChainGenerationProgress,
  ChainGeneratorConfig,
  GeneratedChainBlueprint,
} from "./types";

export interface BlueprintGenerationRequest {
  id: number;
  config: ChainGeneratorConfig;
}

export type BlueprintGenerationResponse =
  | ({ id: number; type: "progress" } & ChainGenerationProgress)
  | {
      id: number;
      type: "complete";
      result: GeneratedChainBlueprint;
      decodedEntityCount: number;
    }
  | {
      id: number;
      type: "error";
      error: string;
    };
