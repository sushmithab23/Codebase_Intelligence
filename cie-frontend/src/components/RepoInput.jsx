import { useState } from "react";

export default function RepoInput({
  onAnalyse, onUrlChange, loading, hasMap,
  onImpact, loadingImpact,
  impactQuery, setImpactQuery,
  modules, onRefresh,
}) {
  const [url, setUrl]               = useState("");
  const [impactFile, setImpactFile] = useState("");

  const handleUrlChange = (value) => {
    setUrl(value);
    onUrlChange(value);
  };

  const handleAnalyse = (e) => {
    e.preventDefault();
    if (url.trim()) onAnalyse(url.trim());
  };

  const handleImpact = (e) => {
    e.preventDefault();
    if (impactQuery.trim()) onImpact(impactQuery.trim(), impactFile.trim());
  };

  const handleFunctionChange = (value) => {
    setImpactQuery(value);
    if (modules?.length && value.trim()) {
      const keyword = value.toLowerCase().split(".")[0];
      const match = modules.find(m =>
        m.files?.some(f => f.toLowerCase().includes(keyword))
      );
      if (match?.files?.[0]) setImpactFile(match.files[0]);
    }
  };

  return (
    <div className="repo-input-wrap">
      {/* Step 1 — repo URL */}
      <form className="input-row" onSubmit={handleAnalyse}>
        <div className="input-group">
          <label className="input-label">
            <span className="step-badge">1</span>
            GitHub repository
          </label>
          <div className="input-line">
            <input
              className="text-input"
              type="text"
              value={url}
              onChange={e => handleUrlChange(e.target.value)}
              placeholder="https://github.com/owner/repo"
              disabled={loading}
            />
            <button className="btn-primary" type="submit" disabled={loading || !url.trim()}>
              {loading ? <span className="btn-spinner" /> : "Map with Bob ↗"}
            </button>
            {/* Refresh button — clears cache and re-fetches from Bob */}
            {hasMap && (
              <button
                type="button"
                className="btn-refresh"
                onClick={onRefresh}
                title="Re-fetch map from Bob (uses 1 coin)"
              >
                ↺
              </button>
            )}
          </div>
        </div>
      </form>

      {/* Step 2 — impact query */}
      {hasMap && (
        <form className="input-row impact-row" onSubmit={handleImpact}>
          <div className="input-group">
            <label className="input-label">
              <span className="step-badge step-badge-purple">2</span>
              What breaks if I change…
            </label>
            <div className="input-line">
              <input
                className="text-input"
                type="text"
                value={impactQuery}
                onChange={e => handleFunctionChange(e.target.value)}
                placeholder="e.g. router.handle or handle"
                disabled={loadingImpact}
              />
              <input
                className="text-input file-input"
                type="text"
                value={impactFile}
                onChange={e => setImpactFile(e.target.value)}
                placeholder="file path (auto-fills)"
                disabled={loadingImpact}
              />
              <button
                className="btn-impact"
                type="submit"
                disabled={loadingImpact || !impactQuery.trim()}
              >
                {loadingImpact ? <span className="btn-spinner" /> : "Analyse →"}
              </button>
            </div>
          </div>
        </form>
      )}
    </div>
  );
}
