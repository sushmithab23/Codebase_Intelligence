import { useState, useCallback } from "react";
import FlowChart from "./components/FlowChart";
import GeneratePanel from "./components/GeneratePanel";
import { getFlow, getImpact, generateContent, getFunctions } from "./api/cie";
import "./App.css";

const CACHE_KEY = "cie_flow_cache_v2";
function loadCache() { try { return JSON.parse(sessionStorage.getItem(CACHE_KEY) || "{}"); } catch { return {}; } }
function saveCache(c) { try { sessionStorage.setItem(CACHE_KEY, JSON.stringify(c)); } catch {} }

const NAV = [
  { id: "overview",  icon: "⊞", label: "Overview",         desc: "Stats & summary" },
  { id: "map",       icon: "◎", label: "Codebase Map",     desc: "Visual flow map" },
  { id: "impact",    icon: "⚡", label: "Impact Analysis",  desc: "What breaks if I change X?" },
  { id: "docs",      icon: "◈", label: "Documentation",    desc: "Generate docs for any module" },
  { id: "tests",     icon: "⬡", label: "Tests",            desc: "Generate tests for any module" },
  { id: "search",    icon: "⊙", label: "Search",           desc: "Find modules by name" },
];

export default function App() {
  const [repoUrl, setRepoUrl]           = useState("");
  const [repoInput, setRepoInput]       = useState("");
  const [flowData, setFlowData]         = useState(null);
  const [selectedNode, setSelectedNode] = useState(null);
  const [impactData, setImpactData]     = useState(null);
  const [generated, setGenerated]       = useState(null);
  const [functions, setFunctions]       = useState([]);
  const [selectedFn, setSelectedFn]     = useState(null);
  const [activeNav, setActiveNav]       = useState("map");
  const [searchQuery, setSearchQuery]   = useState("");
  const [autoMode, setAutoMode]         = useState(null); // "tests" | "docs" — auto-trigger on node click

  // Chat state
  const [chatMessages, setChatMessages] = useState([
    { role: "bob", text: "Hi! Paste a GitHub URL above to get started. I'll map your entire codebase and help you understand it." }
  ]);
  const [chatInput, setChatInput]       = useState("");
  const [impactQuery, setImpactQuery]   = useState("");
  const [impactFile, setImpactFile]     = useState("");

  const [loadingMap,       setLoadingMap]       = useState(false);
  const [loadingImpact,    setLoadingImpact]     = useState(false);
  const [loadingGenerate,  setLoadingGenerate]   = useState(false);
  const [loadingFunctions, setLoadingFunctions]  = useState(false);
  const [error, setError]                        = useState(null);

  // Stats derived from flow data
  const stats = flowData ? {
    modules:   flowData.flow?.length || 0,
    files:     [...new Set(
      (flowData.flow || []).flatMap(n => n.files || (n.file ? [n.file] : []))
    )].length || 0,
    functions: (flowData.flow || []).reduce((a, n) => {
      if (["route","function","process","service"].includes(n.type)) return a + 1;
      return a;
    }, 0),
    entries:   (flowData.flow || []).filter(n =>
      ["entry","start","route"].includes(n.type)
    ).length,
  } : null;

  const handleAnalyse = useCallback(async (url) => {
    if (!url.trim()) return;
    setError(null); setImpactData(null); setSelectedNode(null);
    setGenerated(null); setFunctions([]); setSelectedFn(null);

    const cache = loadCache();
    if (cache[url]) {
      setFlowData(cache[url]); setRepoUrl(url); setActiveNav("map");
      setChatMessages(prev => [...prev, { role: "bob", text: `Loaded cached map for ${url.split("/").slice(-1)[0]}. ${cache[url].flow?.length} nodes found. Click any node to explore.` }]);
      return;
    }

    setLoadingMap(true);
    setChatMessages(prev => [...prev, { role: "user", text: `Analyse ${url}` }, { role: "bob", text: "Reading the repository… this takes about 15 seconds.", loading: true }]);

    try {
      const data = await getFlow(url);
      setFlowData(data); setRepoUrl(url);
      saveCache({ ...cache, [url]: data });
      setActiveNav("map");
      setChatMessages(prev => prev.map(m => m.loading ? { role: "bob", text: `Done! Found ${data.flow?.length} nodes in the flow. Click any node to see functions and generate tests or docs.` } : m));
    } catch {
      setError("Could not analyse repo.");
      setChatMessages(prev => prev.map(m => m.loading ? { role: "bob", text: "Failed to analyse. Check the URL and make sure the backend is running." } : m));
    } finally { setLoadingMap(false); }
  }, [repoUrl]);

  const handleImpact = useCallback(async () => {
    if (!repoUrl || !impactQuery.trim()) return;
    setLoadingImpact(true); setImpactData(null);
    setChatMessages(prev => [...prev,
      { role: "user", text: `What breaks if I change ${impactQuery}?` },
      { role: "bob", text: "Tracing dependencies…", loading: true }
    ]);
    try {
      const data = await getImpact(repoUrl, impactQuery.trim(), impactFile.trim());
      setImpactData(data);
      const affected = data.affectedModuleIds?.length || 0;
      setChatMessages(prev => prev.map(m => m.loading ? {
        role: "bob",
        text: `Impact analysis complete. ${affected} module${affected !== 1 ? "s" : ""} affected. Risk level: ${data.riskLevel?.toUpperCase()}. ${data.riskReason || ""}`,
        impact: data,
      } : m));
      setActiveNav("impact");
    } catch {
      setChatMessages(prev => prev.map(m => m.loading ? { role: "bob", text: "Impact analysis failed." } : m));
    } finally { setLoadingImpact(false); }
  }, [repoUrl, impactQuery, impactFile]);

  const handleNodeClick = useCallback(async (node) => {
    setSelectedNode(node); setGenerated(null); setSelectedFn(null); setFunctions([]);
    if (node.file && repoUrl) {
      setLoadingFunctions(true);
      try {
        const data = await getFunctions(repoUrl, node.file);
        setFunctions(data.functions || []);
        // Auto-generate if in tests or docs mode
        if (autoMode && node.file) {
          setTimeout(() => handleGenerate(node, autoMode, null), 300);
        }
      } catch { setFunctions([]); }
      finally { setLoadingFunctions(false); }
    }
  }, [repoUrl, autoMode]);

  const handleGenerate = useCallback(async (node, mode, fnName = null) => {
    if (!repoUrl || !node?.file) return;
    setLoadingGenerate(true); setGenerated(null);
    try {
      const data = await generateContent(repoUrl, node.file, mode, fnName);
      setGenerated(data);
    } catch { setError("Generation failed."); }
    finally { setLoadingGenerate(false); }
  }, [repoUrl]);

  const handleChatSend = (e) => {
    e.preventDefault();
    if (!chatInput.trim()) return;
    const msg = chatInput.trim();
    setChatInput("");
    // Check if it looks like an impact query
    if (msg.toLowerCase().includes("break") || msg.toLowerCase().includes("change") || msg.toLowerCase().includes("impact")) {
      const fnMatch = msg.match(/[`'"]([\w.]+)[`'"]/);
      if (fnMatch) {
        setImpactQuery(fnMatch[1]);
        handleImpact();
        return;
      }
    }
    setChatMessages(prev => [...prev,
      { role: "user", text: msg },
      { role: "bob", text: "To analyse impact, type: what breaks if I change `functionName`? Or click any node on the map to generate tests and docs." }
    ]);
  };

  const handleRefresh = () => {
    const cache = loadCache(); delete cache[repoUrl]; saveCache(cache);
    setFlowData(null); setImpactData(null); setSelectedNode(null);
    setGenerated(null); setFunctions([]); setSelectedFn(null);
  };

  const repoName = repoUrl ? repoUrl.split("/").slice(-1)[0] : null;
  const repoOwner = repoUrl ? repoUrl.split("/").slice(-2, -1)[0] : null;

  return (
    <div className="dashboard">
      {/* ── Left Sidebar ── */}
      <aside className="sidebar">
        <div className="sidebar-brand">
          <div className="brand-icon">
            <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
              <rect width="32" height="32" rx="10" fill="rgba(55,138,221,0.15)" stroke="rgba(55,138,221,0.4)" strokeWidth="1"/>
              <circle cx="16" cy="16" r="5" fill="#378ADD"/>
              <line x1="16" y1="2"  x2="16" y2="9"  stroke="#378ADD" strokeWidth="1.5" strokeLinecap="round"/>
              <line x1="16" y1="23" x2="16" y2="30" stroke="#378ADD" strokeWidth="1.5" strokeLinecap="round"/>
              <line x1="2"  y1="16" x2="9"  y2="16" stroke="#378ADD" strokeWidth="1.5" strokeLinecap="round"/>
              <line x1="23" y1="16" x2="30" y2="16" stroke="#378ADD" strokeWidth="1.5" strokeLinecap="round"/>
              <line x1="5"  y1="5"  x2="10" y2="10" stroke="#1D9E75" strokeWidth="1.2" strokeLinecap="round"/>
              <line x1="22" y1="22" x2="27" y2="27" stroke="#1D9E75" strokeWidth="1.2" strokeLinecap="round"/>
              <line x1="27" y1="5"  x2="22" y2="10" stroke="#1D9E75" strokeWidth="1.2" strokeLinecap="round"/>
              <line x1="10" y1="22" x2="5"  y2="27" stroke="#1D9E75" strokeWidth="1.2" strokeLinecap="round"/>
            </svg>
          </div>
          <div>
            <div className="brand-title">Bob CIE</div>
            <div className="brand-sub">Codebase Intelligence</div>
          </div>
        </div>

        <nav className="sidebar-nav">
          {NAV.map(item => (
            <button
              key={item.id}
              className={`nav-item ${activeNav === item.id ? "active" : ""}`}
              onClick={() => {
                setActiveNav(item.id);
                // Set auto-mode for tests/docs
                if (item.id === "tests") setAutoMode("tests");
                else if (item.id === "docs") setAutoMode("docs");
                else setAutoMode(null);
                // Focus impact bar
                if (item.id === "impact") {
                  setTimeout(() => document.querySelector(".impact-input")?.focus(), 100);
                }
              }}
            >
              <span className="nav-icon">{item.icon}</span>
              <span className="nav-label">{item.label}</span>
              {activeNav === item.id && item.desc && <span className="nav-desc">{item.desc}</span>}
            </button>
          ))}
        </nav>

        <div className="sidebar-footer">
          {!flowData ? (
            <div className="upload-box">
              <div className="upload-title">Upload Repository</div>
              <div className="upload-sub">Connect a GitHub repo to get started</div>
              <form onSubmit={e => { e.preventDefault(); handleAnalyse(repoInput); }} className="repo-form">
                <input
                  className="repo-input"
                  value={repoInput}
                  onChange={e => setRepoInput(e.target.value)}
                  placeholder="github.com/owner/repo"
                  disabled={loadingMap}
                />
                <button className="btn-connect" type="submit" disabled={loadingMap || !repoInput.trim()}>
                  {loadingMap ? <span className="spin" /> : "→ Analyse"}
                </button>
              </form>
            </div>
          ) : (
            <div className="repo-status">
              <div className="status-dot" />
              <div>
                <div className="status-repo">{repoName}</div>
                <div className="status-time">Analysed · {repoOwner}</div>
              </div>
              <button className="btn-reanalyse" onClick={handleRefresh} title="Re-analyse">↺</button>
            </div>
          )}
        </div>
      </aside>

      {/* ── Main Content ── */}
      <main className="main-content">
        {/* Top bar */}
        <div className="topbar">
          <div className="topbar-left">
            {repoName ? (
              <>
                <span className="topbar-label">Repository</span>
                <span className="topbar-repo">{repoName}</span>
                <span className="topbar-badge">Analysed</span>
              </>
            ) : (
              <span className="topbar-label">No repository loaded</span>
            )}
          </div>
          <div className="topbar-right">
            <div className="ibm-bob-btn">
              <span className="ibm-bob-dot" />
              IBM Bob
            </div>
          </div>
        </div>

        {/* Stats row */}
        {stats && (
          <div className="stats-row">
            {[
              { icon: "⊞", value: stats.modules,   label: "Nodes" },
              { icon: "◎", value: stats.files,     label: "Files" },
              { icon: "⬡", value: stats.functions, label: "Functions" },
              { icon: "→", value: stats.entries,   label: "Entry Points" },
            ].map((s, i) => (
              <div key={i} className="stat-card">
                <span className="stat-icon">{s.icon}</span>
                <div>
                  <div className="stat-value">{s.value}</div>
                  <div className="stat-label">{s.label}</div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Impact input bar */}
        {flowData && (
          <div className="impact-bar">
            <span className="impact-bar-label">⚡ Impact Analysis</span>
            {autoMode && <span className="auto-mode-badge">Auto-{autoMode} mode on — click any node</span>}
            <input
              className="impact-input"
              value={impactQuery}
              onChange={e => setImpactQuery(e.target.value)}
              placeholder="Function name to analyse…"
              onKeyDown={e => e.key === "Enter" && handleImpact()}
            />
            <input
              className="impact-input file-input-sm"
              value={impactFile}
              onChange={e => setImpactFile(e.target.value)}
              placeholder="file path (optional)"
              onKeyDown={e => e.key === "Enter" && handleImpact()}
            />
            <button className="btn-impact-run" onClick={handleImpact} disabled={loadingImpact || !impactQuery.trim()}>
              {loadingImpact ? <span className="spin" /> : "Analyse →"}
            </button>
          </div>
        )}

        {/* Map area */}
        <div className="map-area">
          {loadingMap && (
            <div className="map-loading-overlay">
              <div className="loading-spinner" />
              <span>Bob is reading the repository…</span>
            </div>
          )}

          {flowData && (
            <FlowChart
              nodes={flowData.flow}
              edges={flowData.edges}
              affectedIds={impactData?.affectedModuleIds || []}
              selectedId={selectedNode?.id || null}
              onNodeClick={handleNodeClick}
              loadingImpact={loadingImpact}
            />
          )}

          {/* Search overlay */}
          {activeNav === "search" && flowData && (
            <div className="search-overlay">
              <input
                className="search-box"
                autoFocus
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Search nodes by name or file…"
              />
              <div className="search-results">
                {flowData.flow
                  .filter(n => !searchQuery || n.label.toLowerCase().includes(searchQuery.toLowerCase()) || (n.file||"").toLowerCase().includes(searchQuery.toLowerCase()))
                  .map(n => (
                    <button key={n.id} className="search-result-item" onClick={() => { handleNodeClick(n); setActiveNav("map"); }}>
                      <span className="sr-dot" style={{ background: ["route","entry","start"].includes(n.type)?"#1D9E75":n.type==="decision"?"#BA7517":"#7F77DD" }}/>
                      <div>
                        <div className="sr-label">{n.label}</div>
                        {n.file && <div className="sr-file">{n.file}</div>}
                      </div>
                    </button>
                  ))
                }
              </div>
            </div>
          )}

          {/* Overview panel */}
          {activeNav === "overview" && flowData && (
            <div className="overview-panel">
              <h2 className="ov-title">Repository Overview</h2>
              <p className="ov-sub">{repoUrl}</p>
              <div className="ov-nodes">
                {flowData.flow.map(n => (
                  <div key={n.id} className="ov-node-card" onClick={() => { handleNodeClick(n); setActiveNav("map"); }}>
                    <div className="ov-node-dot" style={{ background: ["route","entry","start"].includes(n.type)?"#1D9E75":n.type==="function"?"#7F77DD":n.type==="decision"?"#BA7517":"#378ADD" }}/>
                    <div>
                      <div className="ov-node-name">{n.label}</div>
                      {n.file && <div className="ov-node-file">{n.file}</div>}
                      {n.description && <div className="ov-node-desc">{n.description}</div>}
                    </div>
                    <span className="ov-node-type">{n.type}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {!flowData && !loadingMap && (
            <div className="map-empty">
              <div className="map-empty-grid" />
              <div className="map-empty-content">
                <div className="map-empty-icon">
                  <svg width="64" height="64" viewBox="0 0 64 64" fill="none">
                    <circle cx="32" cy="32" r="30" stroke="#1e1e1c" strokeWidth="1.5"/>
                    <circle cx="32" cy="32" r="8" fill="#1e1e1c"/>
                    <line x1="32" y1="2"  x2="32" y2="18" stroke="#2c2c2a" strokeWidth="2" strokeLinecap="round"/>
                    <line x1="32" y1="46" x2="32" y2="62" stroke="#2c2c2a" strokeWidth="2" strokeLinecap="round"/>
                    <line x1="2"  y1="32" x2="18" y2="32" stroke="#2c2c2a" strokeWidth="2" strokeLinecap="round"/>
                    <line x1="46" y1="32" x2="62" y2="32" stroke="#2c2c2a" strokeWidth="2" strokeLinecap="round"/>
                  </svg>
                </div>
                <p className="map-empty-title">Paste a GitHub URL in the sidebar</p>
                <p className="map-empty-sub">Bob will map the full runtime flow of the application</p>
              </div>
            </div>
          )}
        </div>

        {/* Bottom module panel */}
        {selectedNode && (
          <div className="module-panel">
            <GeneratePanel
              node={selectedNode}
              functions={functions}
              loadingFunctions={loadingFunctions}
              selectedFn={selectedFn}
              onSelectFn={setSelectedFn}
              generated={generated}
              loading={loadingGenerate}
              onGenerate={handleGenerate}
              onClose={() => { setSelectedNode(null); setFunctions([]); setSelectedFn(null); setGenerated(null); }}
              onClear={() => { setGenerated(null); setSelectedFn(null); }}
              impactData={
                selectedNode && impactData?.affectedModuleIds?.includes(selectedNode.id) ? impactData : null
              }
              inline
            />
          </div>
        )}
      </main>

      {/* ── Right Chat Sidebar ── */}
      <aside className="chat-sidebar">
        <div className="chat-header">
          <div className="chat-tabs">
            <button className="chat-tab active">Ask Bob</button>
            <button className="chat-tab">History</button>
          </div>
        </div>

        <div className="chat-messages">
          {chatMessages.map((msg, i) => (
            <div key={i} className={`chat-msg ${msg.role}`}>
              {msg.role === "bob" && (
                <div className="bob-avatar">
                  <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                    <circle cx="9" cy="9" r="8" fill="rgba(55,138,221,0.2)" stroke="#378ADD" strokeWidth="1"/>
                    <circle cx="9" cy="9" r="3" fill="#378ADD"/>
                  </svg>
                </div>
              )}
              <div className={`msg-bubble ${msg.role}`}>
                {msg.loading ? (
                  <span className="typing-dots"><span/><span/><span/></span>
                ) : (
                  <>
                    <p>{msg.text}</p>
                    {msg.impact && (
                      <div className="impact-msg-detail">
                        <div className="impact-msg-row">
                          <span className="impact-msg-label" style={{color: msg.impact.riskLevel === "high" ? "#E24B4A" : msg.impact.riskLevel === "medium" ? "#EF9F27" : "#1D9E75"}}>
                            ● Directly Affected ({msg.impact.directCallers?.length || 0})
                          </span>
                          {msg.impact.directCallers?.slice(0,3).map((c, ci) => (
                            <div key={ci} className="impact-msg-file">{c.file}</div>
                          ))}
                        </div>
                        {msg.impact.indirectDependents?.length > 0 && (
                          <div className="impact-msg-row">
                            <span className="impact-msg-label" style={{color:"#EF9F27"}}>
                              ● Indirectly Affected ({msg.impact.indirectDependents.length})
                            </span>
                            {msg.impact.indirectDependents.slice(0,2).map((f, fi) => (
                              <div key={fi} className="impact-msg-file">{f}</div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          ))}
        </div>

        <form className="chat-input-row" onSubmit={handleChatSend}>
          <input
            className="chat-input"
            value={chatInput}
            onChange={e => setChatInput(e.target.value)}
            placeholder="Ask anything about your codebase…"
          />
          <button className="chat-send" type="submit" disabled={!chatInput.trim()}>→</button>
        </form>
      </aside>
    </div>
  );
}
