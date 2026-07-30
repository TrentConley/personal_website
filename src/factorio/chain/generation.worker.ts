import { decodeBlueprint } from "../core/codec";
import { generateChainBlueprint } from "./generator";
import type { BlueprintGenerationRequest, BlueprintGenerationResponse } from "./worker-types";

interface WorkerScope {
  onmessage: ((event: MessageEvent<BlueprintGenerationRequest>) => void) | null;
  postMessage(message: BlueprintGenerationResponse): void;
}

const workerScope = self as unknown as WorkerScope;

workerScope.onmessage = ({ data: request }) => {
  try {
    const result = generateChainBlueprint(request.config, (progress) => {
      workerScope.postMessage({
        id: request.id,
        type: "progress",
        ...progress,
      });
    });
    const decoded = decodeBlueprint(result.blueprintString);
    workerScope.postMessage({
      id: request.id,
      type: "complete",
      result,
      decodedEntityCount: decoded.blueprint.entities.length,
    });
  } catch (error) {
    workerScope.postMessage({
      id: request.id,
      type: "error",
      error: error instanceof Error ? error.message : String(error),
    });
  }
};
