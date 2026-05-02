import { useEffect, useRef, useCallback, useState } from "react";
import * as d3 from "d3";

const TYPE_COLORS = {
  entry:   { fill: "#0d2240", stroke: "#378ADD", text: "#7BB8F0", label: "Entry" },
  service: { fill: "#082418", stroke: "#1D9E75", text: "#5DCAA5", label: "Service" },
  util:    { fill: "#1e1e1c", stroke: "#666460", text: "#A8A69C", label: "Util" },
  test:    { fill: "#231900", stroke: "#BA7517", text: "#EF9F27", label: "Test" },
  config:  { fill: "#130f2e", stroke: "#7F77DD", text: "#AFA9EC", label: "Config" },
};
const DEFAULT_COLOR = TYPE_COLORS.util;

const NODE_W = 148;
const NODE_H = 52;
const NODE_R = 10;

export default function CodebaseMap({
  modules, edges, affectedIds, selectedId, onModuleClick, loadingImpact,
}) {
  const svgRef  = useRef(null);
  const simRef  = useRef(null);
  const wrapRef = useRef(null);
  const [tooltip, setTooltip] = useState(null); // { x, y, module }

  const getColor = (type) => TYPE_COLORS[type] || DEFAULT_COLOR;

  const draw = useCallback(() => {
    if (!svgRef.current || !modules?.length) return;

    const wrap = wrapRef.current;
    const W = wrap?.clientWidth  || window.innerWidth  * 0.62 || 800;
    const H = wrap?.clientHeight || window.innerHeight * 0.68 || 520;

    d3.select(svgRef.current).selectAll("*").remove();

    const svg = d3.select(svgRef.current)
      .attr("width", W)
      .attr("height", H);

    // ── Defs: arrow marker + glow filters ──────────────────
    const defs = svg.append("defs");

    defs.append("marker")
      .attr("id", "arrow")
      .attr("viewBox", "0 0 10 10")
      .attr("refX", 9).attr("refY", 5)
      .attr("markerWidth", 5).attr("markerHeight", 5)
      .attr("orient", "auto-start-reverse")
      .append("path")
      .attr("d", "M2 2L8 5L2 8")
      .attr("fill", "none")
      .attr("stroke", "#444441")
      .attr("stroke-width", 1.5)
      .attr("stroke-linecap", "round");

    // Red glow filter for affected nodes
    const redGlow = defs.append("filter").attr("id", "red-glow");
    redGlow.append("feGaussianBlur").attr("stdDeviation", "4").attr("result", "coloredBlur");
    const rMerge = redGlow.append("feMerge");
    rMerge.append("feMergeNode").attr("in", "coloredBlur");
    rMerge.append("feMergeNode").attr("in", "SourceGraphic");

    // Blue glow for selected node
    const blueGlow = defs.append("filter").attr("id", "blue-glow");
    blueGlow.append("feGaussianBlur").attr("stdDeviation", "3").attr("result", "coloredBlur");
    const bMerge = blueGlow.append("feMerge");
    bMerge.append("feMergeNode").attr("in", "coloredBlur");
    bMerge.append("feMergeNode").attr("in", "SourceGraphic");

    // ── Build nodes & edges ─────────────────────────────────
    const nodeMap = Object.fromEntries(
      modules.map(m => [m.id, { ...m, x: W / 2, y: H / 2 }])
    );
    const nodes = Object.values(nodeMap);

    // Auto-generate edges if none returned
    let edgeList = (edges || []).filter(e => nodeMap[e.from] && nodeMap[e.to]);
    if (edgeList.length === 0 && modules.length > 1) {
      const entryMods = modules.filter(m => m.type === "entry");
      const otherMods = modules.filter(m => m.type !== "entry");
      if (entryMods.length > 0) {
        entryMods.forEach(entry => {
          otherMods.forEach(other => edgeList.push({ from: entry.id, to: other.id, type: "import" }));
        });
      } else {
        modules.slice(1).forEach(m => edgeList.push({ from: modules[0].id, to: m.id, type: "import" }));
      }
    }
    const links = edgeList.map(e => ({ source: e.from, target: e.to, type: e.type }));

    // ── Zoom / pan ─────────────────────────────────────────
    const g = svg.append("g").attr("class", "map-g");
    svg.call(
      d3.zoom().scaleExtent([0.2, 3])
        .on("zoom", (event) => g.attr("transform", event.transform))
    );

    // ── Links ──────────────────────────────────────────────
    const linkSel = g.append("g").selectAll("line")
      .data(links).join("line")
      .attr("stroke", "#252523")
      .attr("stroke-width", 1.5)
      .attr("marker-end", "url(#arrow)");

    // ── Node groups ────────────────────────────────────────
    const nodeSel = g.append("g").selectAll("g")
      .data(nodes, d => d.id)
      .join("g")
      .attr("class", "map-node")
      .style("cursor", "pointer");

    // Outer glow ring (hidden by default, shown on affect/select)
    nodeSel.append("rect")
      .attr("class", "node-glow")
      .attr("width",  NODE_W + 10)
      .attr("height", NODE_H + 10)
      .attr("x", -(NODE_W + 10) / 2)
      .attr("y", -(NODE_H + 10) / 2)
      .attr("rx", NODE_R + 4)
      .attr("fill", "none")
      .attr("stroke", "transparent")
      .attr("stroke-width", 2)
      .attr("opacity", 0);

    // Main background rect
    nodeSel.append("rect")
      .attr("class", "node-bg")
      .attr("width",  NODE_W)
      .attr("height", NODE_H)
      .attr("x", -NODE_W / 2)
      .attr("y", -NODE_H / 2)
      .attr("rx", NODE_R)
      .attr("fill",   d => getColor(d.type).fill)
      .attr("stroke", d => getColor(d.type).stroke)
      .attr("stroke-width", 1.5);

    // Left colour badge
    nodeSel.append("rect")
      .attr("width",  7)
      .attr("height", NODE_H)
      .attr("x", -NODE_W / 2)
      .attr("y", -NODE_H / 2)
      .attr("rx", NODE_R)
      .attr("fill", d => getColor(d.type).stroke);

    // Module type label (small, top-left)
    nodeSel.append("text")
      .attr("text-anchor", "start")
      .attr("x", -NODE_W / 2 + 16)
      .attr("y", -NODE_H / 2 + 13)
      .attr("fill", d => getColor(d.type).stroke)
      .attr("font-size", 9)
      .attr("font-weight", 600)
      .attr("font-family", "monospace")
      .attr("letter-spacing", "0.08em")
      .attr("opacity", 0.8)
      .text(d => (getColor(d.type).label || d.type).toUpperCase());

    // Module name label (main)
    nodeSel.append("text")
      .attr("class", "node-label")
      .attr("text-anchor", "middle")
      .attr("x", 4)
      .attr("y", 6)
      .attr("fill", d => getColor(d.type).text)
      .attr("font-size", 13)
      .attr("font-weight", 600)
      .attr("font-family", "monospace")
      .text(d => d.label);

    // File count badge
    nodeSel.append("text")
      .attr("text-anchor", "end")
      .attr("x", NODE_W / 2 - 10)
      .attr("y", NODE_H / 2 - 8)
      .attr("fill", d => getColor(d.type).stroke)
      .attr("font-size", 9)
      .attr("font-family", "monospace")
      .attr("opacity", 0.6)
      .text(d => d.files?.length ? `${d.files.length}f` : "");

    // ── Hover tooltip ──────────────────────────────────────
    nodeSel
      .on("mouseenter", (event, d) => {
        const rect = wrapRef.current.getBoundingClientRect();
        setTooltip({
          x: event.clientX - rect.left + 12,
          y: event.clientY - rect.top  - 10,
          module: d,
        });
      })
      .on("mousemove", (event) => {
        const rect = wrapRef.current.getBoundingClientRect();
        setTooltip(prev => prev ? {
          ...prev,
          x: event.clientX - rect.left + 12,
          y: event.clientY - rect.top  - 10,
        } : null);
      })
      .on("mouseleave", () => setTooltip(null));

    // ── Force simulation ────────────────────────────────────
    if (simRef.current) simRef.current.stop();
    simRef.current = d3.forceSimulation(nodes)
      .force("link",    d3.forceLink(links).id(d => d.id).distance(200))
      .force("charge",  d3.forceManyBody().strength(-500))
      .force("center",  d3.forceCenter(W / 2, H / 2))
      .force("collide", d3.forceCollide(100))
      .on("tick", () => {
        linkSel
          .attr("x1", d => d.source.x)
          .attr("y1", d => d.source.y)
          .attr("x2", d => d.target.x)
          .attr("y2", d => d.target.y);
        nodeSel.attr("transform", d => `translate(${d.x},${d.y})`);
      });

    // ── Drag + click ────────────────────────────────────────
    nodeSel.call(
      d3.drag()
        .clickDistance(4)
        .on("start", (event, d) => {
          if (!event.active) simRef.current.alphaTarget(0.3).restart();
          d.fx = d.x; d.fy = d.y;
          d._dragged = false;
        })
        .on("drag", (event, d) => {
          d.fx = event.x; d.fy = event.y;
          d._dragged = true;
        })
        .on("end", (event, d) => {
          if (!event.active) simRef.current.alphaTarget(0);
          d.fx = null; d.fy = null;
          if (!d._dragged) onModuleClick(d);
          d._dragged = false;
        })
    );

    svgRef.current._nodeSel = nodeSel;
    svgRef.current._linkSel = linkSel;
    svgRef.current._nodes   = nodes;

  }, [modules, edges, onModuleClick]);

  // Redraw when data changes
  useEffect(() => {
    // Try multiple times with increasing delays
    // This ensures container has rendered at full size before D3 measures it
    const t1 = setTimeout(() => draw(), 50);
    const t2 = setTimeout(() => draw(), 200);
    const t3 = setTimeout(() => draw(), 500);
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); };
  }, [draw]);

  // Also use ResizeObserver for reliable size detection
  useEffect(() => {
    if (!wrapRef.current) return;
    const observer = new ResizeObserver(() => draw());
    observer.observe(wrapRef.current);
    return () => observer.disconnect();
  }, [draw]);

  // Resize
  useEffect(() => {
    const onResize = () => draw();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [draw]);

  // ── Impact highlighting ─────────────────────────────────
  useEffect(() => {
    if (!svgRef.current?._nodeSel) return;
    const nodeSel = svgRef.current._nodeSel;
    const linkSel = svgRef.current._linkSel;
    const hasAffected = affectedIds.length > 0;

    // Node highlighting
    nodeSel.select(".node-bg")
      .attr("stroke", d => {
        if (affectedIds.includes(d.id)) return "#E24B4A";
        if (d.id === selectedId)        return "#7F77DD";
        return getColor(d.type).stroke;
      })
      .attr("stroke-width", d =>
        affectedIds.includes(d.id) ? 2.5 :
        d.id === selectedId ? 2 : 1.5
      )
      .attr("fill", d => {
        if (affectedIds.includes(d.id)) return "#2a0808";
        if (d.id === selectedId)        return "#1a1540";
        return hasAffected ? "#111110" : getColor(d.type).fill;
      })
      .attr("opacity", d =>
        !hasAffected ? 1 :
        affectedIds.includes(d.id) ? 1 : 0.25
      );

    // Glow ring for affected nodes
    nodeSel.select(".node-glow")
      .attr("stroke", d => affectedIds.includes(d.id) ? "#E24B4A" : "transparent")
      .attr("opacity", d => affectedIds.includes(d.id) ? 0.6 : 0)
      .attr("filter", d => affectedIds.includes(d.id) ? "url(#red-glow)" : "none");

    // Label dimming
    nodeSel.select(".node-label")
      .attr("fill", d => {
        if (affectedIds.includes(d.id)) return "#FF8080";
        if (!hasAffected) return getColor(d.type).text;
        return "#333330";
      })
      .attr("font-weight", d => affectedIds.includes(d.id) ? 700 : 600);

    // Link highlighting — make edges TO affected nodes red
    if (linkSel) {
      linkSel
        .attr("stroke", d => {
          const targetId = typeof d.target === "object" ? d.target.id : d.target;
          const sourceId = typeof d.source === "object" ? d.source.id : d.source;
          if (affectedIds.includes(targetId) || affectedIds.includes(sourceId)) return "#E24B4A";
          return hasAffected ? "#1a1a18" : "#252523";
        })
        .attr("stroke-width", d => {
          const targetId = typeof d.target === "object" ? d.target.id : d.target;
          const sourceId = typeof d.source === "object" ? d.source.id : d.source;
          if (affectedIds.includes(targetId) || affectedIds.includes(sourceId)) return 2;
          return 1;
        })
        .attr("opacity", d => {
          if (!hasAffected) return 1;
          const targetId = typeof d.target === "object" ? d.target.id : d.target;
          const sourceId = typeof d.source === "object" ? d.source.id : d.source;
          if (affectedIds.includes(targetId) || affectedIds.includes(sourceId)) return 1;
          return 0.1;
        })
        .attr("marker-end", d => {
          const targetId = typeof d.target === "object" ? d.target.id : d.target;
          if (affectedIds.includes(targetId)) return "url(#arrow-red)";
          return "url(#arrow)";
        });
    }

  }, [affectedIds, selectedId]);

  const getColor_stable = (type) => TYPE_COLORS[type] || DEFAULT_COLOR;

  return (
    <div className="map-container" ref={wrapRef}>
      {/* Legend */}
      <div className="map-legend">
        {Object.entries(TYPE_COLORS).map(([type, c]) => (
          <div key={type} className="legend-item">
            <div className="legend-dot" style={{ background: c.stroke }} />
            <span>{type}</span>
          </div>
        ))}
        {affectedIds.length > 0 && (
          <div className="legend-item impact-legend">
            <div className="legend-dot" style={{ background: "#E24B4A" }} />
            <span>affected ({affectedIds.length})</span>
          </div>
        )}
      </div>

      {/* Loading impact overlay */}
      {loadingImpact && (
        <div className="impact-overlay-msg">
          <span className="impact-pulse" /> Bob is tracing dependencies…
        </div>
      )}

      {/* Impact summary banner */}
      {affectedIds.length > 0 && !loadingImpact && (
        <div className="impact-banner">
          <span className="impact-banner-icon">⚡</span>
          <span className="impact-banner-text">
            <strong>{affectedIds.length} module{affectedIds.length > 1 ? "s" : ""} affected</strong>
            {" — "}
            {affectedIds.map((id, i) => {
              const m = modules.find(mod => mod.id === id);
              return (
                <span key={id} className="affected-name">
                  {m?.label || id}{i < affectedIds.length - 1 ? ", " : ""}
                </span>
              );
            })}
          </span>
        </div>
      )}

      {/* Tooltip */}
      {tooltip && (
        <div
          className="node-tooltip"
          style={{ left: tooltip.x, top: tooltip.y }}
        >
          <div className="tooltip-title">{tooltip.module.label}</div>
          <div className="tooltip-type">{tooltip.module.type}</div>
          {tooltip.module.files?.map((f, i) => (
            <div key={i} className="tooltip-file">{f}</div>
          ))}
          <div className="tooltip-hint">click to generate tests & docs</div>
        </div>
      )}

      <svg ref={svgRef} className="map-svg" />
    </div>
  );
}
