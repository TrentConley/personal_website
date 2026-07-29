import { useMemo, useState } from "react";
import {
  PRODUCT_GROUPS,
  boundaryMaterialsFor,
  directIngredientsFor,
  generateChainBlueprint,
  type MaterialRate,
} from "../factorio/chain";
import { decodeBlueprint } from "../factorio/core/codec";
import { BELT_TIERS, SIDES, type BeltTier, type Side } from "../factorio/core/types";

const FEATURED_TARGETS = [
  "electronic-circuit",
  "advanced-circuit",
  "processing-unit",
  "automation-science-pack",
  "logistic-science-pack",
  "military-science-pack",
  "chemical-science-pack",
  "production-science-pack",
  "utility-science-pack",
] as const;

function title(value: string): string {
  return value
    .split("-")
    .map((part) => part[0].toUpperCase() + part.slice(1))
    .join(" ");
}

function parseInputs(source: string): MaterialRate[] {
  return source
    .split(",")
    .map((raw) => raw.trim())
    .filter(Boolean)
    .map((entry) => {
      const [name, cap] = entry.split("=", 2).map((part) => part.trim());
      if (!name) throw new Error("Every input needs a material name.");
      if (cap === undefined || cap === "") return { name };
      const maximum = Number(cap);
      if (!Number.isFinite(maximum) || maximum <= 0) {
        throw new Error(`${name} needs a positive throughput cap.`);
      }
      return { name, maxPerSecond: maximum };
    });
}

function suggestedInputs(output: string, depth: "direct" | "raw"): string {
  const materials = depth === "direct" ? directIngredientsFor(output) : boundaryMaterialsFor(output);
  return materials.join(", ");
}

export function FactorioBlueprintPage() {
  const [output, setOutput] = useState<string>("electronic-circuit");
  const [rate, setRate] = useState(1);
  const [inputs, setInputs] = useState(suggestedInputs(output, "raw"));
  const [inputSide, setInputSide] = useState<Side>("west");
  const [outputSide, setOutputSide] = useState<Side>("east");
  const [beltTier, setBeltTier] = useState<BeltTier>("blue");
  const [copied, setCopied] = useState(false);

  const generated = useMemo(() => {
    try {
      const result = generateChainBlueprint({
        output,
        outputPerSecond: rate,
        inputs: parseInputs(inputs),
        inputSide,
        outputSide,
        beltTier,
      });
      const decoded = decodeBlueprint(result.blueprintString);
      return {
        result,
        decodedEntityCount: decoded.blueprint.entities.length,
      } as const;
    } catch (error) {
      return {
        error: error instanceof Error ? error.message : String(error),
      } as const;
    }
  }, [beltTier, inputSide, inputs, output, outputSide, rate]);

  const chooseTarget = (next: string) => {
    setOutput(next);
    const featured = FEATURED_TARGETS.includes(next as typeof FEATURED_TARGETS[number]);
    setInputs(suggestedInputs(next, featured ? "raw" : "direct"));
    setCopied(false);
  };

  const copyBlueprint = async () => {
    const result = "result" in generated ? generated.result : undefined;
    if (!result) return;
    await navigator.clipboard.writeText(result.blueprintString);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1_800);
  };

  const downloadBlueprint = () => {
    const result = "result" in generated ? generated.result : undefined;
    if (!result) return;
    const blob = new Blob([`${result.blueprintString}\n`], {
      type: "text/plain",
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${output}-${result.plan.effectiveOutputPerSecond.toFixed(3)}ps.txt`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="factorio-page">
      <nav className="factorio-nav">
        <a className="factorio-nav__home" href="/" aria-label="Back to Trent Conley's homepage">
          TC
        </a>
        <div>
          <strong>Foundry</strong>
          <span>Factorio blueprint generator</span>
        </div>
        <span className="factorio-status"><i /> Tested in Factorio 2.0.77</span>
      </nav>

      <main className="factorio-main">
        <header className="factorio-hero">
          <p>Recursive vanilla production planner</p>
          <h1>Describe the boundary.<br />Get the whole factory.</h1>
          <div className="factorio-hero__copy">
            <p>
              Select one of 111 circuit, science, logistics, military, rail, robot, module,
              armor, or equipment outputs. List what you will supply on belts and pipes; the
              planner builds every missing intermediate and returns one Factorio-ready string.
            </p>
            <span>Vanilla 2.0 · no refinery processing · no rocket · no modules in machines · no beacons</span>
          </div>
        </header>

        <div className="factorio-workspace">
          <form className="factorio-config" onSubmit={(event) => event.preventDefault()}>
            <div className="factorio-card-heading">
              <span>01</span>
              <div><small>Configure</small><h2>Factory boundary</h2></div>
            </div>

            <label>
              Output
              <select value={output} onChange={(event) => chooseTarget(event.target.value)}>
                <optgroup label="Circuits & science">
                  {FEATURED_TARGETS.map((target) => <option key={target} value={target}>{title(target)}</option>)}
                </optgroup>
                {PRODUCT_GROUPS.map((group) => (
                  <optgroup key={group.id} label={group.label}>
                    {group.products.map((target) => <option key={target} value={target}>{title(target)}</option>)}
                  </optgroup>
                ))}
              </select>
            </label>

            <label>
              Requested output
              <div className="factorio-number">
                <input
                  type="number"
                  min="0.001"
                  step="0.05"
                  value={rate}
                  onChange={(event) => setRate(Number(event.target.value))}
                />
                <span>items / second</span>
              </div>
            </label>

            <label>
              Supplied inputs
              <textarea
                value={inputs}
                onChange={(event) => setInputs(event.target.value)}
                rows={5}
                spellCheck={false}
              />
            </label>
            <div className="factorio-presets" aria-label="Input presets">
              <button type="button" onClick={() => setInputs(suggestedInputs(output, "direct"))}>Direct components</button>
              <button type="button" onClick={() => setInputs(suggestedInputs(output, "raw"))}>Raw + simple fluids</button>
            </div>
            <p className="factorio-help">
              Comma-separated. Add a cap with <code>=</code>, for example <code>copper-ore=30</code>.
              Each solid defaults to one selected belt; fluids default to 1,200/s.
            </p>

            <div className="factorio-field-grid">
              <label>Inputs enter from
                <select value={inputSide} onChange={(event) => setInputSide(event.target.value as Side)}>
                  {SIDES.map((side) => <option key={side} value={side}>{title(side)}</option>)}
                </select>
              </label>
              <label>Output leaves from
                <select value={outputSide} onChange={(event) => setOutputSide(event.target.value as Side)}>
                  {SIDES.map((side) => <option key={side} value={side}>{title(side)}</option>)}
                </select>
              </label>
            </div>

            <label>Belt tier
              <select value={beltTier} onChange={(event) => setBeltTier(event.target.value as BeltTier)}>
                {BELT_TIERS.map((tier) => <option key={tier} value={tier}>{title(tier)}</option>)}
              </select>
            </label>
          </form>

          <section className="factorio-result" aria-live="polite">
            {"error" in generated ? (
              <div className="factorio-error">
                <span>!</span>
                <div><strong>Cannot build this boundary</strong><p>{generated.error}</p></div>
              </div>
            ) : (
              <>
                <div className="factorio-result__heading">
                  <div><small>Generated factory</small><h2>{title(generated.result.plan.target)}</h2></div>
                  <span className="factorio-valid">✓ Importable envelope</span>
                </div>

                <div className="factorio-metrics">
                  <div><small>Promised output</small><strong>{generated.result.plan.effectiveOutputPerSecond.toFixed(3)}<span>/s</span></strong><p>{generated.result.plan.clamped ? `Safely clamped from ${rate}/s` : "Requested capacity"}</p></div>
                  <div><small>Machines</small><strong>{generated.result.plan.recipes.reduce((sum, recipe) => sum + recipe.machineCount, 0)}</strong><p>{generated.result.plan.recipes.length} recursive recipes</p></div>
                  <div><small>Entities</small><strong>{generated.decodedEntityCount.toLocaleString()}</strong><p>Decoded from final string</p></div>
                </div>

                {generated.result.warnings.map((warning) => (
                  <div className="factorio-warning" key={warning}>△ {warning}</div>
                ))}

                <div className="factorio-rates">
                  <h3>External input rates</h3>
                  <div className="factorio-table-scroll">
                    <table>
                      <thead><tr><th>Input</th><th>Required</th><th>Allowed</th><th>Load</th></tr></thead>
                      <tbody>
                        {generated.result.plan.inputs.map((input) => (
                          <tr key={input.name}>
                            <td>{title(input.name)}<small>{input.type}</small></td>
                            <td>{input.requiredPerSecond.toFixed(3)}/s</td>
                            <td>{input.maximumPerSecond.toFixed(1)}/s</td>
                            <td>{(input.utilization * 100).toFixed(1)}%</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div className="factorio-actions">
                  <button type="button" className="factorio-actions__primary" onClick={copyBlueprint}>
                    {copied ? "✓ Copied" : "Copy blueprint"}
                  </button>
                  <button type="button" onClick={downloadBlueprint}>Download .txt</button>
                </div>
                <textarea
                  className="factorio-blueprint"
                  readOnly
                  value={generated.result.blueprintString}
                  aria-label="Generated Factorio blueprint string"
                  onFocus={(event) => event.currentTarget.select()}
                />
                <p className="factorio-proof">
                  Verified headlessly in Factorio 2.0.77: all 102 manufactured-product cases plus
                  the recursive circuit/science suite imported, placed, powered, and produced.
                </p>
              </>
            )}
          </section>
        </div>
      </main>
    </div>
  );
}
