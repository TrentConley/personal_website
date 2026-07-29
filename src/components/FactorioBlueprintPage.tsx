import { useMemo, useState } from "react";
import {
  PRODUCT_GROUPS,
  VANILLA_CATALOG,
  boundaryMaterialsFor,
  directIngredientsFor,
  generateChainBlueprint,
  recipeFor,
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

const ALL_MATERIALS = Object.keys(VANILLA_CATALOG.materialTypes).sort((left, right) =>
  title(left).localeCompare(title(right)),
);

const BARREL_SUFFIX = "-barrel";

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

function inputEntries(source: string): Array<{ name: string; cap?: string; source: string }> {
  return source
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((sourceEntry) => {
      const [name, cap] = sourceEntry.split("=", 2).map((part) => part.trim());
      return { name, cap: cap || undefined, source: sourceEntry };
    });
}

function MaterialIcon({ name, className = "" }: { name: string; className?: string }) {
  const fluidName = name.endsWith(BARREL_SUFFIX) && name !== "barrel"
    ? name.slice(0, -BARREL_SUFFIX.length)
    : undefined;
  return (
    <span className={`factorio-material-icon ${className}`.trim()} aria-hidden="true">
      <img src={`/factorio-icons/${name}.png`} alt="" loading="lazy" />
      {fluidName && (
        <span className="factorio-material-icon__badge">
          <img src={`/factorio-icons/${fluidName}.png`} alt="" loading="lazy" />
        </span>
      )}
    </span>
  );
}

export function FactorioBlueprintPage() {
  const [output, setOutput] = useState<string>("electronic-circuit");
  const [rate, setRate] = useState(1);
  const [inputs, setInputs] = useState(suggestedInputs(output, "raw"));
  const [inputSide, setInputSide] = useState<Side>("west");
  const [outputSide, setOutputSide] = useState<Side>("east");
  const [beltTier, setBeltTier] = useState<BeltTier>("blue");
  const [copied, setCopied] = useState(false);
  const [ingredientSearch, setIngredientSearch] = useState("");

  const selectedInputs = useMemo(() => inputEntries(inputs), [inputs]);
  const selectedInputNames = useMemo(
    () => new Set(selectedInputs.map((input) => input.name)),
    [selectedInputs],
  );
  const matchingMaterials = useMemo(() => {
    const query = ingredientSearch.trim().toLowerCase();
    if (!query) return [];
    const terms = query.split(/\s+/).filter(Boolean);
    return ALL_MATERIALS
      .filter((material) => {
        const searchable = `${material} ${title(material)}`.toLowerCase();
        return terms.every((term) => searchable.includes(term));
      })
      .sort((left, right) => {
        const leftStarts = left.startsWith(query) ? 0 : 1;
        const rightStarts = right.startsWith(query) ? 0 : 1;
        return leftStarts - rightStarts || title(left).localeCompare(title(right));
      })
      .slice(0, 12);
  }, [ingredientSearch]);
  const outputRecipe = recipeFor(output);

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
    setIngredientSearch("");
    setCopied(false);
  };

  const addInput = (name: string) => {
    if (selectedInputNames.has(name)) return;
    setInputs([...selectedInputs.map((input) => input.source), name].join(", "));
  };

  const removeInput = (name: string) => {
    setInputs(selectedInputs
      .filter((input) => input.name !== name)
      .map((input) => input.source)
      .join(", "));
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

            {outputRecipe && (
              <section className="factorio-recipe-card" aria-label={`${title(output)} recipe ingredients`}>
                <div className="factorio-recipe-card__output">
                  <MaterialIcon name={output} className="factorio-material-icon--large" />
                  <div>
                    <small>Direct recipe</small>
                    <strong>{title(output)}</strong>
                    <span>{outputRecipe.result.amount} produced per craft</span>
                  </div>
                </div>
                <h3>Ingredients</h3>
                <ol className="factorio-recipe-ingredients">
                  {outputRecipe.ingredients.map((ingredient, index) => (
                    <li key={ingredient.name}>
                      <span className="factorio-ingredient-number">{index + 1}</span>
                      <MaterialIcon name={ingredient.name} />
                      <span><strong>{title(ingredient.name)}</strong><small>{ingredient.type}</small></span>
                      <b>{ingredient.amount}</b>
                    </li>
                  ))}
                </ol>
              </section>
            )}

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

            <section className="factorio-input-builder" aria-labelledby="factorio-input-heading">
              <div className="factorio-input-builder__heading">
                <div><small>Factory boundary</small><h3 id="factorio-input-heading">Supplied inputs</h3></div>
                <span>{selectedInputs.length} selected</span>
              </div>

              <ol className="factorio-selected-inputs">
                {selectedInputs.map((input, index) => (
                  <li key={`${input.source}-${index}`}>
                    <span className="factorio-ingredient-number">{index + 1}</span>
                    <MaterialIcon name={input.name} />
                    <span>
                      <strong>{title(input.name)}</strong>
                      <small>{VANILLA_CATALOG.materialTypes[input.name] ?? "unknown"}{input.cap ? ` · cap ${input.cap}/s` : " · default cap"}</small>
                    </span>
                    <button type="button" onClick={() => removeInput(input.name)} aria-label={`Remove ${title(input.name)}`}>×</button>
                  </li>
                ))}
              </ol>

              <label className="factorio-ingredient-search">
                Search ingredients
                <input
                  type="search"
                  value={ingredientSearch}
                  onChange={(event) => setIngredientSearch(event.target.value)}
                  placeholder="Try iron, plate, acid…"
                  autoComplete="off"
                />
              </label>

              {ingredientSearch.trim() && (
                <div className="factorio-search-results" aria-live="polite">
                  {matchingMaterials.length > 0 ? matchingMaterials.map((material) => {
                    const selected = selectedInputNames.has(material);
                    return (
                      <button key={material} type="button" disabled={selected} onClick={() => addInput(material)}>
                        <MaterialIcon name={material} />
                        <span><strong>{title(material)}</strong><small>{VANILLA_CATALOG.materialTypes[material]}</small></span>
                        <b>{selected ? "Added" : "+ Add"}</b>
                      </button>
                    );
                  }) : <p>No vanilla materials match “{ingredientSearch}”.</p>}
                </div>
              )}

              <div className="factorio-presets" aria-label="Input presets">
                <button type="button" onClick={() => setInputs(suggestedInputs(output, "direct"))}>Direct components</button>
                <button type="button" onClick={() => setInputs(suggestedInputs(output, "raw"))}>Raw + simple fluids</button>
              </div>

              <details className="factorio-advanced-inputs">
                <summary>Advanced caps / text entry</summary>
                <label>
                  Comma-separated boundary
                  <textarea
                    aria-label="Advanced supplied inputs"
                    value={inputs}
                    onChange={(event) => setInputs(event.target.value)}
                    rows={4}
                    spellCheck={false}
                  />
                </label>
              </details>
              <p className="factorio-help">
                Search and add any vanilla material. Set a cap in advanced entry with <code>=</code>,
                for example <code>copper-ore=30</code>. Solids default to one selected belt;
                fluids default to 1,200/s.
              </p>
            </section>

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
                  <div className="factorio-result__title">
                    <MaterialIcon name={generated.result.plan.target} className="factorio-material-icon--large" />
                    <div><small>Generated factory</small><h2>{title(generated.result.plan.target)}</h2></div>
                  </div>
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
                            <td><MaterialIcon name={input.name} /><span>{title(input.name)}<small>{input.type}</small></span></td>
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
                <p className="factorio-icon-credit">Factorio item artwork © Wube Software.</p>
              </>
            )}
          </section>
        </div>
      </main>
    </div>
  );
}
