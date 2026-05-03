import { useState } from "react";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { vscDarkPlus } from "react-syntax-highlighter/dist/esm/styles/prism";

// Strip markdown code fences that the model sometimes adds
function stripFences(code) {
  if (!code) return code;
  return code
    .replace(/^```[a-zA-Z]*\n?/gm, "")
    .replace(/```$/gm, "")
    .trim();
}

const RISK_CONFIG = {
  high:   { color: "#E24B4A", bg: "#2a0808", label: "High risk" },
  medium: { color: "#EF9F27", bg: "#2e1f00", label: "Medium risk" },
  low:    { color: "#1D9E75", bg: "#0a2418", label: "Low risk" },
};

const NODE_TYPE_COLORS = {
  start:"#1D9E75", end:"#E24B4A", route:"#378ADD",
  function:"#888780", decision:"#BA7517", process:"#7F77DD",
};

export default function GeneratePanel({
  node, functions, loadingFunctions, selectedFn, onSelectFn,
  generated, loading, onGenerate, onClose, onClear, impactData, inline,
}) {
  const [activeTab, setActiveTab] = useState("tests");
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    const content = activeTab === "tests" ? generated?.tests : generated?.docs;
    if (content) { navigator.clipboard.writeText(content); setCopied(true); setTimeout(() => setCopied(false), 2000); }
  };

  if (!node) return null;

  const risk     = impactData ? RISK_CONFIG[impactData.riskLevel] || RISK_CONFIG.low : null;
  const dotColor = NODE_TYPE_COLORS[node.type] || "#888780";

  if (inline) {
    // ── Inline bottom panel layout ──────────────────────
    return (
      <div className="module-panel-inner">
        {/* Left: module info */}
        <div className="module-info-col">
          <div className="module-info-header">
            <div className="module-dot" style={{ background: dotColor, boxShadow: `0 0 8px ${dotColor}66` }} />
            <div>
              <div className="module-info-name">{node.label}</div>
              {node.file && <div className="module-info-file">{node.file}</div>}
              {node.description && <div className="module-info-desc">{node.description}</div>}
            </div>
            <button className="module-close" onClick={onClose}>✕</button>
          </div>

          {risk && (
            <div className="module-risk" style={{ background: risk.bg, borderColor: risk.color }}>
              <span style={{ color: risk.color }}>● {risk.label}</span>
              <span className="module-risk-reason">{impactData.riskReason}</span>
            </div>
          )}

          {/* Function list */}
          <div className="module-fn-section">
            <div className="module-fn-label">
              {loadingFunctions ? "Loading functions…" :
               functions.length > 0 ? `${functions.length} function${functions.length > 1 ? "s" : ""} found` :
               "Top Functions"}
            </div>
            {functions.length > 0 && (
              <div className="module-fn-list">
                {functions.slice(0, 6).map((fn, i) => (
                  <button
                    key={i}
                    className={`module-fn-chip ${selectedFn === fn ? "active" : ""}`}
                    onClick={() => onSelectFn(selectedFn === fn ? null : fn)}
                  >
                    {fn}()
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Right: generate buttons or output */}
        <div className="module-gen-col">
          {!generated && !loading && (
            <>
              <div className="module-gen-label">
                Generate for: <strong>{selectedFn ? `${selectedFn}()` : "entire file"}</strong>
              </div>
              <div className="module-gen-btns">
                <button className="module-gen-btn tests"
                  onClick={() => { onGenerate(node, "tests", selectedFn); setActiveTab("tests"); }}>
                  <span>⬡</span> Generate Tests
                </button>
                <button className="module-gen-btn docs"
                  onClick={() => { onGenerate(node, "docs", selectedFn); setActiveTab("docs"); }}>
                  <span>◈</span> Generate Docs
                </button>
              </div>
            </>
          )}

          {loading && (
            <div className="module-loading">
              <div className="loading-bars-sm">
                {[...Array(4)].map((_, i) => <div key={i} className="loading-bar-sm" style={{ animationDelay: `${i * 0.15}s` }} />)}
              </div>
              <span>Bob is generating{selectedFn ? ` for ${selectedFn}()` : ""}…</span>
            </div>
          )}

          {generated && !loading && (
            <div className="module-output">
              <div className="module-output-tabs">
                {generated.tests && (
                  <button className={`mod-tab ${activeTab === "tests" ? "active" : ""}`} onClick={() => setActiveTab("tests")}>
                    Tests {generated.framework && <span className="fw-badge">{generated.framework}</span>}
                  </button>
                )}
                {generated.docs && (
                  <button className={`mod-tab ${activeTab === "docs" ? "active" : ""}`} onClick={() => setActiveTab("docs")}>
                    Docs
                  </button>
                )}
                <button className="mod-tab-copy" onClick={handleCopy}>{copied ? "Copied ✓" : "Copy"}</button>
                <button className="mod-tab-back" onClick={() => { onClear(); onSelectFn(null); }}>← Back</button>
              </div>
              <div className="module-code">
                <SyntaxHighlighter
                  language={activeTab === "tests" ? (generated.framework === "pytest" ? "python" : "javascript") : "markdown"}
                  style={vscDarkPlus}
                  customStyle={{ background: "transparent", fontSize: "12px", margin: 0, padding: "0.75rem" }}
                  showLineNumbers
                >
                  {activeTab === "tests" ? stripFences(generated.tests) || "" : stripFences(generated.docs) || ""}
                </SyntaxHighlighter>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  // ── Fallback: original panel layout ──────────────────
  return (
    <div className="generate-panel">
      <div className="panel-header">
        <div className="module-name-row">
          {generated && <button className="btn-back" onClick={() => { onClear(); onSelectFn(null); }}>←</button>}
          <div className="module-type-dot" style={{ background: dotColor }} />
          <span className="module-name">{node.label}</span>
          <button className="panel-close" onClick={onClose}>✕</button>
        </div>
        {node.file && <span className="module-file">{node.file}</span>}
        {node.description && <p className="node-description">{node.description}</p>}
        {node.file && (node.file.includes("*") || node.file.endsWith("/")) && (
          <div className="wildcard-warning">
            ⚠ This node represents multiple files ({node.file}).
            Bob could not extract individual functions.
            Try clicking a node with a specific file path like <code>src/app.js</code>
          </div>
        )}
      </div>

      <div className="panel-body">
        {risk && (
          <div className="impact-summary" style={{ background: risk.bg, borderColor: risk.color }}>
            <div className="impact-risk" style={{ color: risk.color }}>● {risk.label}</div>
            <div className="impact-reason">{impactData.riskReason}</div>
          </div>
        )}

        {!generated && !loading && (
          <>
            <div className="fn-section">
              <div className="fn-section-label">
                {loadingFunctions ? "Loading functions…" : functions.length > 0 ? `${functions.length} functions found` : "No functions extracted"}
              </div>
              {functions.length > 0 && (
                <div className="fn-list">
                  <button className={`fn-chip ${!selectedFn ? "fn-chip-active" : ""}`} onClick={() => onSelectFn(null)}>Entire file</button>
                  {functions.map((fn, i) => (
                    <button key={i} className={`fn-chip ${selectedFn === fn ? "fn-chip-active" : ""}`} onClick={() => onSelectFn(fn)}>{fn}()</button>
                  ))}
                </div>
              )}
            </div>
            {node.file && !node.file.includes("*") && !node.file.endsWith("/") && (
              <div className="generate-buttons">
                <div className="gen-context-label">Generating for: <strong>{selectedFn ? `${selectedFn}()` : "entire file"}</strong></div>
                <button className="btn-generate" onClick={() => { onGenerate(node, "tests", selectedFn); setActiveTab("tests"); }}><span className="btn-icon">⬡</span> Generate Tests</button>
                <button className="btn-generate btn-docs" onClick={() => { onGenerate(node, "docs", selectedFn); setActiveTab("docs"); }}><span className="btn-icon">◈</span> Generate Docs</button>
                <button className="btn-generate btn-both" onClick={() => { onGenerate(node, "both", selectedFn); setActiveTab("tests"); }}>Generate Both ↗</button>
              </div>
            )}
          </>
        )}

        {loading && (
          <div className="panel-loading">
            <div className="loading-bars">{[...Array(4)].map((_, i) => <div key={i} className="loading-bar" style={{ animationDelay: `${i*0.15}s` }} />)}</div>
            <span>Bob is generating…</span>
          </div>
        )}

        {generated && !loading && (
          <div className="output-wrap">
            <div className="output-tabs">
              {generated.tests && <button className={`tab ${activeTab==="tests"?"active":""}`} onClick={() => setActiveTab("tests")}>Tests {generated.framework && <span className="framework-badge">{generated.framework}</span>}</button>}
              {generated.docs  && <button className={`tab ${activeTab==="docs"?"active":""}`}  onClick={() => setActiveTab("docs")}>Docs</button>}
              <button className="tab-copy" onClick={handleCopy}>{copied?"Copied ✓":"Copy"}</button>
            </div>
            <div className="output-code">
              <SyntaxHighlighter language={activeTab==="tests"?(generated.framework==="pytest"?"python":"javascript"):"markdown"} style={vscDarkPlus} customStyle={{background:"transparent",fontSize:"12px",margin:0,padding:"1rem"}} showLineNumbers>
                {activeTab==="tests" ? generated.tests||"" : generated.docs||""}
              </SyntaxHighlighter>
            </div>
            <button className="btn-regen" onClick={() => { onGenerate(node,"both",selectedFn); setActiveTab("tests"); }}>↺ Regenerate</button>
          </div>
        )}
      </div>
    </div>
  );
}
