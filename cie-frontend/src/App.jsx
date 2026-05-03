import { useState, useCallback } from "react";
import FlowChart from "./components/FlowChart";
import GeneratePanel from "./components/GeneratePanel";
import { getFlow, getImpact, generateContent, getFunctions } from "./api/cie";
import "./App.css";

const CACHE_KEY = "cie_flow_v3";
function loadCache() { try { return JSON.parse(sessionStorage.getItem(CACHE_KEY) || "{}"); } catch { return {}; } }
function saveCache(c) { try { sessionStorage.setItem(CACHE_KEY, JSON.stringify(c)); } catch {} }

const NAV = [
  { id: "overview",  icon: "⊞", label: "Overview",        desc: "Stats & summary" },
  { id: "map",       icon: "◎", label: "Codebase Map",    desc: "Visual flow map" },
  { id: "impact",    icon: "⚡", label: "Impact Analysis", desc: "What breaks if I change X?" },
  { id: "generate",  icon: "✦", label: "Generate",        desc: "Tests & docs for any module" },
  { id: "search",    icon: "⊙", label: "Search",          desc: "Find modules by name" },
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
  const [chatTab, setChatTab]           = useState("ask");
  const [searchQuery, setSearchQuery]   = useState("");
  const [autoMode]         = useState(null);
  const [impactQuery, setImpactQuery]   = useState("");
  const [impactFile, setImpactFile]     = useState("");
  const [loadingMap, setLoadingMap]     = useState(false);
  const [loadingImpact, setLoadingImpact]       = useState(false);
  const [loadingGenerate, setLoadingGenerate]   = useState(false);
  const [loadingFunctions, setLoadingFunctions] = useState(false);
  const [showImpactModal, setShowImpactModal]   = useState(false);
  const [chatMessages, setChatMessages] = useState([
    { role: "bob", text: "Hi! Paste a GitHub URL in the sidebar to get started. I'll map your entire codebase and help you understand it." }
  ]);
  const [chatInput, setChatInput] = useState("");
  const [history, setHistory]     = useState([]);

  const addHistory = useCallback((type, label, detail) => {
    setHistory(prev => [{
      type, label, detail: detail || "",
      time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      id: Date.now(),
    }, ...prev].slice(0, 30));
  }, []);

  const stats = flowData ? {
    modules:   flowData.flow?.length || 0,
    files:     [...new Set((flowData.flow || []).flatMap(n => n.files || (n.file ? [n.file] : [])))].length,
    functions: (flowData.flow || []).filter(n => ["route","function","process","service"].includes(n.type)).length,
    entries:   (flowData.flow || []).filter(n => ["entry","start","route"].includes(n.type)).length,
  } : null;

  const repoName  = repoUrl ? repoUrl.split("/").slice(-1)[0] : null;
  const repoOwner = repoUrl ? repoUrl.split("/").slice(-2, -1)[0] : null;

  const handleAnalyse = useCallback(async (url) => {
    if (!url.trim()) return;
    setImpactData(null); setSelectedNode(null); setGenerated(null); setFunctions([]); setSelectedFn(null);
    const cache = loadCache();
    if (cache[url]) {
      setFlowData(cache[url]); setRepoUrl(url); setActiveNav("map");
      setChatMessages(p => [...p, { role: "bob", text: `Loaded cached map for ${url.split("/").slice(-1)[0]}. ${cache[url].flow?.length} nodes found. Click any node to explore.` }]);
      addHistory("repo", url.split("/").slice(-1)[0], `${cache[url].flow?.length} nodes (cached)`);
      return;
    }
    setLoadingMap(true);
    setChatMessages(p => [...p, { role: "user", text: `Analyse ${url}` }, { role: "bob", text: "Reading the repository… this takes about 15 seconds.", loading: true }]);
    try {
      const data = await getFlow(url);
      setFlowData(data); setRepoUrl(url); saveCache({ ...cache, [url]: data }); setActiveNav("map");
      setChatMessages(p => p.map(m => m.loading ? { role: "bob", text: `Done! Found ${data.flow?.length} nodes. Click any node to see functions and generate tests or docs.` } : m));
      addHistory("repo", url.split("/").slice(-1)[0], `${data.flow?.length} nodes mapped`);
    } catch {
      setChatMessages(p => p.map(m => m.loading ? { role: "bob", text: "Failed to analyse. Check the URL and make sure the backend is running." } : m));
    } finally { setLoadingMap(false); }
  }, [addHistory]);

  const handleImpact = useCallback(async () => {
    if (!repoUrl || !impactQuery.trim()) return;
    setLoadingImpact(true); setImpactData(null); setShowImpactModal(true);
    setChatMessages(p => [...p, { role: "user", text: `What breaks if I change ${impactQuery}?` }, { role: "bob", text: "Tracing dependencies…", loading: true }]);
    try {
      const data = await getImpact(repoUrl, impactQuery.trim(), impactFile.trim());
      setImpactData(data);
      const affected = data.affectedModuleIds?.length || 0;
      addHistory("impact", impactQuery, `Risk: ${data.riskLevel?.toUpperCase()} · ${affected} affected`);
      setChatMessages(p => p.map(m => m.loading ? { role: "bob", text: `${affected} module${affected !== 1 ? "s" : ""} affected. Risk: ${data.riskLevel?.toUpperCase()}. ${data.riskReason || ""}`, impact: data } : m));
    } catch {
      setChatMessages(p => p.map(m => m.loading ? { role: "bob", text: "Impact analysis failed." } : m));
    } finally { setLoadingImpact(false); }
  }, [repoUrl, impactQuery, impactFile, addHistory]);

  const handleGenerate = useCallback(async (node, mode, fnName) => {
    if (!repoUrl || !node?.file) return;
    setLoadingGenerate(true); setGenerated(null);
    try {
      const data = await generateContent(repoUrl, node.file, mode, fnName || null);
      setGenerated(data);
      addHistory(mode === "both" ? "generate" : mode, fnName ? `${fnName}()` : node.label, node.file || "");
    } catch { /* silent */ }
    finally { setLoadingGenerate(false); }
  }, [repoUrl, addHistory]);

  const handleNodeClick = useCallback(async (node) => {
    setSelectedNode(node); setGenerated(null); setSelectedFn(null); setFunctions([]);
    if (activeNav === "impact" && node.file) setImpactFile(node.file);

    if (node.file && repoUrl) {
      const isWildcard = node.file.includes("*") || node.file.endsWith("/");
      if (isWildcard) { setFunctions([]); return; }

      setLoadingFunctions(true);
      try {
        const data = await getFunctions(repoUrl, node.file);
        if (data.expanded_files?.length > 0) {
          setFunctions(data.expanded_files);
        } else {
          setFunctions(data.functions || []);
        }
        if (autoMode && node.file) setTimeout(() => handleGenerate(node, autoMode, null), 300);
      } catch { setFunctions([]); }
      finally { setLoadingFunctions(false); }
    }
  }, [repoUrl, autoMode, activeNav, handleGenerate]);

  const handleRefresh = useCallback(() => {
    const cache = loadCache(); delete cache[repoUrl]; saveCache(cache);
    setFlowData(null); setImpactData(null); setSelectedNode(null);
    setGenerated(null); setFunctions([]); setSelectedFn(null); setShowImpactModal(false);
  }, [repoUrl]);

  const handleChatSend = useCallback((e) => {
    e.preventDefault();
    if (!chatInput.trim()) return;
    const msg = chatInput.trim(); setChatInput("");
    setChatMessages(p => [...p, { role: "user", text: msg }, { role: "bob", text: "Try: \"what breaks if I change `functionName`?\" — or click any node on the map to generate tests and docs." }]);
  }, [chatInput]);

  const handleNavClick = useCallback((item) => {
    setActiveNav(item.id);
    // if (item.id === "generate") setAutoMode("both"); else setAutoMode(null);
    if (item.id === "impact") setTimeout(() => document.querySelector(".impact-input")?.focus(), 100);
  }, []);

  const closeImpactModal = useCallback(() => {
    setShowImpactModal(false);
  }, []);

  return (
    <div className="dashboard">
      {/* ── LEFT SIDEBAR ── */}
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
            <button key={item.id} className={`nav-item ${activeNav === item.id ? "active" : ""}`} onClick={() => handleNavClick(item)}>
              <span className="nav-icon">{item.icon}</span>
              <div className="nav-text">
                <span className="nav-label">{item.label}</span>
                {activeNav === item.id && <span className="nav-desc">{item.desc}</span>}
              </div>
              {item.id === "generate" && autoMode === "both" && <span className="nav-active-dot" />}
            </button>
          ))}
        </nav>

        <div className="sidebar-footer">
          {!flowData ? (
            <div className="upload-box">
              <div className="upload-title">Upload Repository</div>
              <div className="upload-sub">Connect a GitHub repo to get started</div>
              <form onSubmit={e => { e.preventDefault(); handleAnalyse(repoInput); }} className="repo-form">
                <input className="repo-input" value={repoInput}
                  onChange={e => {
                    setRepoInput(e.target.value);
                    if (e.target.value !== repoUrl) {
                      setImpactQuery(""); setImpactFile(""); setImpactData(null);
                      setSelectedNode(null); setGenerated(null); setShowImpactModal(false);
                    }
                  }}
                  placeholder="github.com/owner/repo" disabled={loadingMap} />
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

      {/* ── MAIN CONTENT ── */}
      <main className="main-content">
        <div className="topbar">
          <div className="topbar-left">
            {repoName ? (<><span className="topbar-label">Repository</span><span className="topbar-repo">{repoName}</span><span className="topbar-badge">Analysed</span></>) : (<span className="topbar-label">No repository loaded</span>)}
          </div>
          <div className="topbar-right">
            <div className="ibm-bob-btn"><span className="ibm-bob-dot" />IBM Bob</div>
          </div>
        </div>

        {stats && (
          <div className="stats-row">
            {[{icon:"⊞",value:stats.modules,label:"Nodes"},{icon:"◎",value:stats.files,label:"Files"},{icon:"⬡",value:stats.functions,label:"Functions"},{icon:"→",value:stats.entries,label:"Entry Points"}].map((s,i) => (
              <div key={i} className="stat-card">
                <span className="stat-icon">{s.icon}</span>
                <div><div className="stat-value">{s.value}</div><div className="stat-label">{s.label}</div></div>
              </div>
            ))}
          </div>
        )}

        {flowData && activeNav === "impact" && (
          <div className="impact-bar">
            <div className="impact-bar-info">
              <span className="impact-bar-label">⚡ Impact Analysis</span>
              <span className="impact-bar-hint">What breaks if I change this function?</span>
            </div>
            <div className="impact-bar-inputs">
              <div className="impact-input-group">
                <label className="impact-input-label">Function name</label>
                <input className="impact-input" value={impactQuery} onChange={e => setImpactQuery(e.target.value)} placeholder="e.g. predict_ad_success" onKeyDown={e => e.key === "Enter" && handleImpact()} autoFocus />
              </div>
              <div className="impact-input-group">
                <label className="impact-input-label">File path (optional)</label>
                <input className="impact-input file-input-sm" value={impactFile} onChange={e => setImpactFile(e.target.value)} placeholder="e.g. backend/ml_logic.py" onKeyDown={e => e.key === "Enter" && handleImpact()} />
              </div>
              <button className="btn-impact-run" onClick={handleImpact} disabled={loadingImpact || !impactQuery.trim()}>
                {loadingImpact ? <span className="spin" /> : "Analyse →"}
              </button>
            </div>
            <div className="impact-tip">💡 Click any node on the map first to auto-fill the file path</div>
          </div>
        )}

        <div className="map-area">
          {loadingMap && (<div className="map-loading-overlay"><div className="loading-spinner" /><span>Bob is mapping the application flow…</span></div>)}

          {activeNav === "search" && flowData && (
            <div className="search-overlay">
              <input className="search-box" autoFocus value={searchQuery} onChange={e => setSearchQuery(e.target.value)} placeholder="Search nodes by name or file…" />
              <div className="search-results">
                {(flowData.flow || []).filter(n => !searchQuery || n.label.toLowerCase().includes(searchQuery.toLowerCase()) || (n.file || "").toLowerCase().includes(searchQuery.toLowerCase())).map(n => (
                  <button key={n.id} className="search-result-item" onClick={() => { handleNodeClick(n); setActiveNav("map"); }}>
                    <span className="sr-dot" style={{ background: ["route","entry","start"].includes(n.type)?"#1D9E75":n.type==="decision"?"#BA7517":"#7F77DD" }} />
                    <div><div className="sr-label">{n.label}</div>{n.file && <div className="sr-file">{n.file}</div>}</div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {activeNav === "overview" && flowData && (
            <div className="overview-panel">
              <h2 className="ov-title">Repository Overview</h2>
              <p className="ov-sub">{repoUrl}</p>
              <div className="ov-nodes">
                {(flowData.flow || []).map(n => (
                  <div key={n.id} className="ov-node-card" onClick={() => { handleNodeClick(n); setActiveNav("map"); }}>
                    <div className="ov-node-dot" style={{ background: ["route","entry","start"].includes(n.type)?"#1D9E75":n.type==="function"?"#7F77DD":n.type==="decision"?"#BA7517":"#378ADD" }} />
                    <div><div className="ov-node-name">{n.label}</div>{n.file && <div className="ov-node-file">{n.file}</div>}{n.description && <div className="ov-node-desc">{n.description}</div>}</div>
                    <span className="ov-node-type">{n.type}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {flowData && (
            <FlowChart
              nodes={flowData.flow} edges={flowData.edges}
              affectedIds={activeNav === "impact" ? (impactData?.affectedModuleIds || []) : []}
              selectedId={selectedNode?.id || null}
              onNodeClick={handleNodeClick} loadingImpact={loadingImpact}
              showLegend={["map","impact","generate"].includes(activeNav)}
            />
          )}

          {flowData && activeNav === "generate" && !selectedNode && (
            <div className="generate-instruction">
              <div className="gen-inst-icon">✦</div>
              <div className="gen-inst-title">Generate Mode Active</div>
              <div className="gen-inst-sub">Click any node on the map to automatically generate tests and documentation for that module.</div>
              <div className="gen-inst-steps">
                <div className="gen-inst-step"><span className="gen-step-num">1</span> Click a node</div>
                <div className="gen-inst-arrow">→</div>
                <div className="gen-inst-step"><span className="gen-step-num">2</span> Bob generates</div>
                <div className="gen-inst-arrow">→</div>
                <div className="gen-inst-step"><span className="gen-step-num">3</span> Review Tests + Docs</div>
              </div>
            </div>
          )}

          {!flowData && !loadingMap && (
            <div className="map-empty">
              <div className="map-empty-grid" />
              <div className="map-empty-content">
                <p className="map-empty-title">Paste a GitHub URL in the sidebar</p>
                <p className="map-empty-sub">Bob will trace the full runtime flow of the application</p>
              </div>
            </div>
          )}
        </div>
      </main>

      {/* ── RIGHT SIDEBAR ── */}
      <aside className="chat-sidebar">
        {selectedNode && (
          <div className="gen-slide-panel">
            <GeneratePanel
              node={selectedNode} functions={functions} loadingFunctions={loadingFunctions}
              selectedFn={selectedFn} onSelectFn={setSelectedFn}
              generated={generated} loading={loadingGenerate}
              onGenerate={handleGenerate}
              onClose={() => { setSelectedNode(null); setFunctions([]); setSelectedFn(null); setGenerated(null); }}
              onClear={() => { setGenerated(null); setSelectedFn(null); }}
              impactData={selectedNode && impactData?.affectedModuleIds?.includes(selectedNode.id) ? impactData : null}
            />
          </div>
        )}

        <div className="chat-sidebar-inner" style={{ opacity: selectedNode ? 0 : 1, pointerEvents: selectedNode ? "none" : "auto" }}>
          <div className="chat-header">
            <div className="chat-tabs">
              <button className={`chat-tab ${chatTab === "ask" ? "active" : ""}`} onClick={() => setChatTab("ask")}>Ask Bob</button>
              <button className={`chat-tab ${chatTab === "history" ? "active" : ""}`} onClick={() => setChatTab("history")}>
                History {history.length > 0 && <span className="history-count">{history.length}</span>}
              </button>
            </div>
          </div>

          {chatTab === "history" ? (
            <div className="history-panel">
              {history.length === 0 ? (
                <div className="history-empty">
                  <div className="history-empty-icon">◷</div>
                  <p>No activity yet</p>
                  <p className="history-empty-sub">Analyse a repo to start tracking history</p>
                </div>
              ) : (
                <div className="history-list">
                  {history.map(item => (
                    <div key={item.id} className={`history-item history-${item.type}`}>
                      <div className="history-icon">{item.type==="repo"?"◎":item.type==="impact"?"⚡":item.type==="tests"?"⬡":item.type==="docs"?"◈":"✦"}</div>
                      <div className="history-body">
                        <div className="history-label">{item.label}</div>
                        {item.detail && <div className="history-detail">{item.detail}</div>}
                      </div>
                      <div className="history-time">{item.time}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <>
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
                        <span className="typing-dots"><span /><span /><span /></span>
                      ) : (
                        <>
                          <p>{msg.text}</p>
                          {msg.impact && (
                            <div className="impact-msg-detail">
                              <div className="impact-msg-row">
                                <span className="impact-msg-label" style={{ color: msg.impact.riskLevel==="high"?"#E24B4A":msg.impact.riskLevel==="medium"?"#EF9F27":"#1D9E75" }}>
                                  ● Directly Affected ({msg.impact.directCallers?.length || 0})
                                </span>
                                {msg.impact.directCallers?.slice(0,3).map((c,ci) => <div key={ci} className="impact-msg-file">{c.file}</div>)}
                              </div>
                              {msg.impact.indirectDependents?.length > 0 && (
                                <div className="impact-msg-row">
                                  <span className="impact-msg-label" style={{ color:"#EF9F27" }}>● Indirectly Affected ({msg.impact.indirectDependents.length})</span>
                                  {msg.impact.indirectDependents.slice(0,2).map((f,fi) => <div key={fi} className="impact-msg-file">{f}</div>)}
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
                <input className="chat-input" value={chatInput} onChange={e => setChatInput(e.target.value)} placeholder="Ask anything about your codebase…" />
                <button className="chat-send" type="submit" disabled={!chatInput.trim()}>→</button>
              </form>
            </>
          )}
        </div>
      </aside>

      {/* ── IMPACT MODAL ── */}
      {showImpactModal && (
        <div className="impact-modal-overlay" onClick={(e) => e.target === e.currentTarget && closeImpactModal()}>
          <div className="impact-modal">
            {/* Modal Header */}
            <div className="impact-modal-header">
              <div className="impact-modal-title-row">
                <span className="impact-modal-icon">⚡</span>
                <div>
                  <div className="impact-modal-title">Impact Analysis</div>
                  {impactQuery && (
                    <div className="impact-modal-subtitle">
                      Analysing: <code className="impact-modal-fn">{impactQuery}</code>
                      {impactFile && <span className="impact-modal-file"> · {impactFile}</span>}
                    </div>
                  )}
                </div>
              </div>
              <button className="impact-modal-close" onClick={closeImpactModal} title="Close and view map">
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                  <line x1="1" y1="1" x2="13" y2="13" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
                  <line x1="13" y1="1" x2="1" y2="13" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
                </svg>
                <span>View Map</span>
              </button>
            </div>

            {/* Loading state */}
            {loadingImpact && (
              <div className="impact-modal-loading">
                <div className="impact-modal-spinner">
                  <div className="imp-spin-ring" />
                  <span className="imp-spin-icon">⚡</span>
                </div>
                <div className="impact-modal-loading-text">Tracing dependencies across your codebase…</div>
                <div className="impact-modal-loading-sub">Scanning imports, call graphs, and module boundaries</div>
              </div>
            )}

            {/* Results */}
            {!loadingImpact && impactData && (
              <>
                {/* Summary bar */}
                <div className="impact-modal-summary">
                  <div className={`impact-modal-risk-pill risk-${impactData.riskLevel}`}>
                    <span className="risk-dot" />
                    {impactData.riskLevel?.toUpperCase()} RISK
                  </div>
                  <div className="impact-modal-counts">
                    <span className="imc-num imc-red">{impactData.directCallers?.length || 0}</span>
                    <span className="imc-label">direct</span>
                    <span className="imc-div">·</span>
                    <span className="imc-num imc-amber">{impactData.indirectDependents?.length || 0}</span>
                    <span className="imc-label">indirect</span>
                    {impactData.testsCovering?.length > 0 && (
                      <>
                        <span className="imc-div">·</span>
                        <span className="imc-num imc-green">{impactData.testsCovering.length}</span>
                        <span className="imc-label">tests</span>
                      </>
                    )}
                  </div>
                  {impactData.riskReason && (
                    <div className="impact-modal-reason">{impactData.riskReason}</div>
                  )}
                </div>

                {/* Three columns */}
                <div className="impact-modal-cols">
                  {/* Direct */}
                  <div className="impact-modal-col">
                    <div className="imc-col-header red">
                      <div className="imc-col-title">
                        <span className="imc-col-dot red" />
                        DIRECTLY AFFECTED
                      </div>
                      <span className="imc-col-count">{impactData.directCallers?.length || 0}</span>
                    </div>
                    <div className="imc-col-body">
                      {impactData.directCallers?.length > 0 ? (
                        impactData.directCallers.map((c, i) => (
                          <div key={i} className="imc-file-row">
                            <span className="imc-file-dot red" />
                            <span className="imc-file-name">{c.file}</span>
                            {c.line && <span className="imc-file-line">:{c.line}</span>}
                          </div>
                        ))
                      ) : (
                        <div className="imc-empty">No direct callers found</div>
                      )}
                    </div>
                  </div>

                  {/* Indirect */}
                  <div className="impact-modal-col">
                    <div className="imc-col-header amber">
                      <div className="imc-col-title">
                        <span className="imc-col-dot amber" />
                        INDIRECTLY AFFECTED
                      </div>
                      <span className="imc-col-count">{impactData.indirectDependents?.length || 0}</span>
                    </div>
                    <div className="imc-col-body">
                      {impactData.indirectDependents?.length > 0 ? (
                        impactData.indirectDependents.map((f, i) => (
                          <div key={i} className="imc-file-row">
                            <span className="imc-file-dot amber" />
                            <span className="imc-file-name">{typeof f === "string" ? f : f.file}</span>
                          </div>
                        ))
                      ) : (
                        <div className="imc-empty">No indirect dependents</div>
                      )}
                    </div>
                  </div>

                  {/* Tests */}
                  <div className="impact-modal-col">
                    <div className="imc-col-header green">
                      <div className="imc-col-title">
                        <span className="imc-col-dot green" />
                        TESTS COVERING
                      </div>
                      <span className="imc-col-count">{impactData.testsCovering?.length || 0}</span>
                    </div>
                    <div className="imc-col-body">
                      {impactData.testsCovering?.length > 0 ? (
                        impactData.testsCovering.map((f, i) => (
                          <div key={i} className="imc-file-row">
                            <span className="imc-file-dot green" />
                            <span className="imc-file-name">{f}</span>
                          </div>
                        ))
                      ) : (
                        <div className="imc-empty">No tests found</div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Footer */}
                <div className="impact-modal-footer">
                  <button className="impact-modal-view-btn" onClick={closeImpactModal}>
                    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                      <rect x="1" y="1" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="1.2"/>
                      <rect x="8" y="1" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="1.2"/>
                      <rect x="1" y="8" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="1.2"/>
                      <rect x="8" y="8" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="1.2"/>
                    </svg>
                    View on Map
                  </button>
                  <div className="impact-modal-footer-hint">
                    Affected nodes are highlighted in red on the codebase map
                  </div>
                </div>
              </>
            )}

            {/* No data state (modal opened but no results yet) */}
            {!loadingImpact && !impactData && (
              <div className="impact-modal-empty">
                <div className="impact-modal-empty-icon">⚡</div>
                <div className="impact-modal-empty-text">No results yet</div>
                <div className="impact-modal-empty-sub">Enter a function name above and click Analyse</div>
                <button className="impact-modal-view-btn" onClick={closeImpactModal}>← Back to Map</button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
