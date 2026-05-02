import { useEffect, useRef, useCallback, useState } from "react";
import * as d3 from "d3";

// Type config matching the reference screenshot style
const TYPE_CONFIG = {
  start:    { color: "#FFFFFF", bg: "#1a1b2e", border: "#555468", badge: "START",  dot: "#FFFFFF" },
  end:      { color: "#F09595", bg: "#1e0f0f", border: "#5a2020", badge: "END",    dot: "#E24B4A" },
  route:    { color: "#5DCAA5", bg: "#0d1f18", border: "#1a4d38", badge: "ROUTE",  dot: "#1D9E75" },
  function: { color: "#9896b0", bg: "#141520", border: "#2e2f42", badge: "FUNC",   dot: "#7F77DD" },
  decision: { color: "#EF9F27", bg: "#1e1600", border: "#4d3200", badge: "IF",     dot: "#BA7517" },
  process:  { color: "#7BB8F0", bg: "#0d1828", border: "#1e3d5c", badge: "PROC",  dot: "#378ADD" },
  entry:    { color: "#FFFFFF", bg: "#1a1b2e", border: "#555468", badge: "ENTRY",  dot: "#FFFFFF" },
  service:  { color: "#AFA9EC", bg: "#160f2e", border: "#3d3468", badge: "SVC",    dot: "#7F77DD" },
  util:     { color: "#7BB8F0", bg: "#0d1828", border: "#1e3d5c", badge: "UTIL",   dot: "#378ADD" },
  config:   { color: "#EF9F27", bg: "#1e1600", border: "#4d3200", badge: "CONF",   dot: "#BA7517" },
  test:     { color: "#F09595", bg: "#1e0f0f", border: "#5a2020", badge: "TEST",   dot: "#E24B4A" },
};
const DEFAULT_CFG = TYPE_CONFIG.function;

const NW = 180;
const NH = 56;

function getTypeConfig(type) {
  return TYPE_CONFIG[type] || DEFAULT_CFG;
}

function getFileExt(file) {
  if (!file) return "";
  const ext = file.split(".").pop()?.toUpperCase();
  if (["JS","JSX","TS","TSX"].includes(ext)) return "JS";
  if (["PY"].includes(ext)) return "PY";
  if (["GO"].includes(ext)) return "GO";
  if (["RB"].includes(ext)) return "RB";
  return ext?.slice(0, 2) || "";
}

function shortLabel(label, max = 18) {
  return label.length > max ? label.slice(0, max - 1) + "…" : label;
}

function shortFile(file, max = 28) {
  if (!file) return "";
  return file.length > max ? "…" + file.slice(-(max - 1)) : file;
}

export default function FlowChart({
  nodes, edges, affectedIds, selectedId, onNodeClick, loadingImpact, showLegend = true,
}) {
  const svgRef  = useRef(null);
  const wrapRef = useRef(null);
  const simRef  = useRef(null);
  const [tooltip, setTooltip] = useState(null);

  const draw = useCallback(() => {
    if (!svgRef.current || !nodes?.length) return;

    const W = wrapRef.current?.clientWidth  || 800;
    const H = wrapRef.current?.clientHeight || 560;

    d3.select(svgRef.current).selectAll("*").remove();
    if (simRef.current) simRef.current.stop();

    const svg = d3.select(svgRef.current).attr("width", W).attr("height", H);
    const defs = svg.append("defs");

    // Arrows
    const mkArrow = (id, color) => {
      defs.append("marker").attr("id", id)
        .attr("viewBox","0 0 10 10").attr("refX",9).attr("refY",5)
        .attr("markerWidth",5).attr("markerHeight",5).attr("orient","auto")
        .append("path").attr("d","M2 2L8 5L2 8")
        .attr("fill","none").attr("stroke",color).attr("stroke-width",1.5).attr("stroke-linecap","round");
    };
    mkArrow("ar-default","#3a3a52");
    mkArrow("ar-red","#E24B4A");
    mkArrow("ar-green","#1D9E75");
    mkArrow("ar-blue","#378ADD");

    // Glow filter
    const glow = defs.append("filter").attr("id","glow-selected")
      .attr("x","-40%").attr("y","-40%").attr("width","180%").attr("height","180%");
    glow.append("feGaussianBlur").attr("stdDeviation","4").attr("result","b");
    const gm = glow.append("feMerge");
    gm.append("feMergeNode").attr("in","b");
    gm.append("feMergeNode").attr("in","SourceGraphic");

    const redGlow = defs.append("filter").attr("id","glow-red")
      .attr("x","-40%").attr("y","-40%").attr("width","180%").attr("height","180%");
    redGlow.append("feGaussianBlur").attr("stdDeviation","5").attr("result","b");
    const rm = redGlow.append("feMerge");
    rm.append("feMergeNode").attr("in","b");
    rm.append("feMergeNode").attr("in","SourceGraphic");

    // Build data
    const nodeData = nodes.map(n => ({ ...n, x: W/2 + (Math.random()-0.5)*200, y: H/2 + (Math.random()-0.5)*200 }));
    const nodeById = Object.fromEntries(nodeData.map(n => [n.id, n]));

    let linkData = (edges||[]).filter(e => nodeById[e.from] && nodeById[e.to])
      .map(e => ({ ...e, source: e.from, target: e.to }));

    // Auto-generate edges if none
    if (!linkData.length && nodeData.length > 1) {
      // Connect sequentially
      for (let i = 0; i < nodeData.length - 1; i++) {
        linkData.push({ source: nodeData[i].id, target: nodeData[i+1].id, label: "" });
      }
    }

    // Zoom/pan
    const g = svg.append("g");
    svg.call(d3.zoom().scaleExtent([0.2, 2.5])
      .on("zoom", ev => g.attr("transform", ev.transform)));

    // Draw edges
    const linkSel = g.append("g").selectAll("path")
      .data(linkData).join("path")
      .attr("class","flow-link")
      .attr("fill","none")
      .attr("stroke","#2e2f42").attr("stroke-width",1.5)
      .attr("marker-end","url(#ar-default)");

    // Edge labels
    const labelSel = g.append("g").selectAll("text")
      .data(linkData.filter(e => e.label?.trim())).join("text")
      .attr("text-anchor","middle")
      .attr("font-size",10).attr("font-family","monospace").attr("font-weight",700)
      .attr("letter-spacing","0.06em").attr("dy",-5)
      .attr("fill", d => d.label==="yes"||d.label==="success"?"#1D9E75":d.label==="no"||d.label==="error"?"#E24B4A":"#5a5870")
      .text(d => d.label?.toUpperCase());

    // Draw nodes — FILE CARD STYLE
    const nodeSel = g.append("g").selectAll("g")
      .data(nodeData, d => d.id).join("g")
      .attr("class","flow-node")
      .style("cursor","pointer");

    // Outer glow halo
    nodeSel.append("rect")
      .attr("class","node-glow")
      .attr("width", NW+14).attr("height", NH+14)
      .attr("x", -(NW+14)/2).attr("y", -(NH+14)/2)
      .attr("rx", 12).attr("fill","none")
      .attr("stroke","transparent").attr("stroke-width",2).attr("opacity",0);

    // Card background
    nodeSel.append("rect")
      .attr("class","node-bg")
      .attr("width", NW).attr("height", NH)
      .attr("x", -NW/2).attr("y", -NH/2)
      .attr("rx", 10)
      .attr("fill",   d => getTypeConfig(d.type).bg)
      .attr("stroke", d => getTypeConfig(d.type).border)
      .attr("stroke-width", 1);

    // Left colour indicator strip
    nodeSel.append("rect")
      .attr("width", 4).attr("height", NH-12)
      .attr("x", -NW/2+8).attr("y", -NH/2+6)
      .attr("rx", 2)
      .attr("fill", d => getTypeConfig(d.type).dot);

    // File extension badge (top-right)
    nodeSel.each(function(d) {
      const ext = getFileExt(d.file);
      if (!ext) return;
      const sel = d3.select(this);
      const badgeW = ext.length * 6 + 10;
      sel.append("rect")
        .attr("x", NW/2 - badgeW - 6).attr("y", -NH/2+6)
        .attr("width", badgeW).attr("height", 16)
        .attr("rx", 4)
        .attr("fill", ext==="PY"?"rgba(55,138,221,0.2)":ext==="JS"?"rgba(239,159,39,0.2)":"rgba(127,119,221,0.2)")
        .attr("stroke", ext==="PY"?"rgba(55,138,221,0.4)":ext==="JS"?"rgba(239,159,39,0.4)":"rgba(127,119,221,0.4)")
        .attr("stroke-width", 0.5);
      sel.append("text")
        .attr("x", NW/2 - badgeW/2 - 6).attr("y", -NH/2+14)
        .attr("text-anchor","middle").attr("font-size",8).attr("font-weight",700)
        .attr("font-family","monospace").attr("letter-spacing","0.06em")
        .attr("fill", ext==="PY"?"#7BB8F0":ext==="JS"?"#EF9F27":"#AFA9EC")
        .text(ext);
    });

    // Type dot (left of label)
    nodeSel.append("circle")
      .attr("cx", -NW/2+20).attr("cy", -5)
      .attr("r", 4)
      .attr("fill", d => getTypeConfig(d.type).dot)
      .attr("opacity", 0.8);

    // Main label
    nodeSel.append("text")
      .attr("class","node-label")
      .attr("text-anchor","start")
      .attr("x", -NW/2+30).attr("y", -1)
      .attr("font-size",13).attr("font-weight",700).attr("font-family","monospace")
      .attr("fill", d => getTypeConfig(d.type).color)
      .text(d => shortLabel(d.label));

    // File path (small, below label)
    nodeSel.filter(d => d.file)
      .append("text")
      .attr("text-anchor","start")
      .attr("x", -NW/2+30).attr("y", 16)
      .attr("font-size",9).attr("font-family","monospace")
      .attr("fill", "#5a5870")
      .text(d => shortFile(d.file, 22));

    // Type badge (bottom-right)
    nodeSel.each(function(d) {
      const cfg = getTypeConfig(d.type);
      const sel = d3.select(this);
      const bw = cfg.badge.length * 6 + 10;
      sel.append("rect")
        .attr("x", NW/2-bw-8).attr("y", NH/2-20)
        .attr("width", bw).attr("height", 14).attr("rx", 3)
        .attr("fill", "rgba(0,0,0,0.3)").attr("stroke", cfg.border).attr("stroke-width",0.5);
      sel.append("text")
        .attr("x", NW/2-bw/2-8).attr("y", NH/2-9)
        .attr("text-anchor","middle").attr("font-size",8).attr("font-weight",800)
        .attr("font-family","monospace").attr("letter-spacing","0.1em")
        .attr("fill", cfg.dot).text(cfg.badge);
    });

    // Tooltip
    nodeSel
      .on("mouseenter",(ev,d)=>{const r=wrapRef.current.getBoundingClientRect(); setTooltip({x:ev.clientX-r.left+14,y:ev.clientY-r.top-10,node:d});})
      .on("mousemove",(ev)=>{const r=wrapRef.current.getBoundingClientRect(); setTooltip(p=>p?{...p,x:ev.clientX-r.left+14,y:ev.clientY-r.top-10}:null);})
      .on("mouseleave",()=>setTooltip(null));

    // Force simulation — scatter layout like reference screenshot
    simRef.current = d3.forceSimulation(nodeData)
      .force("link", d3.forceLink(linkData).id(d=>d.id).distance(220))
      .force("charge", d3.forceManyBody().strength(-600))
      .force("center", d3.forceCenter(W/2, H/2))
      .force("collide", d3.forceCollide(110))
      .force("x", d3.forceX(W/2).strength(0.05))
      .force("y", d3.forceY(H/2).strength(0.05))
      .on("tick", () => {
        linkSel.attr("d", d => {
          const s = typeof d.source==="object" ? d.source : nodeById[d.source];
          const t = typeof d.target==="object" ? d.target : nodeById[d.target];
          if(!s||!t) return "";
          const dx = t.x-s.x, dy = t.y-s.y;
          const dist = Math.sqrt(dx*dx+dy*dy)||1;
          // Offset endpoints to edge of node
          const offX = (dx/dist)*(NW/2+4), offY = (dy/dist)*(NH/2+4);
          const sx=s.x+offX, sy=s.y+offY, tx=t.x-offX, ty=t.y-offY;
          const cx = (sx+tx)/2 - dy/dist*30;
          const cy = (sy+ty)/2 + dx/dist*30;
          return `M${sx},${sy} Q${cx},${cy} ${tx},${ty}`;
        });

        labelSel
          .attr("x", d=>{const s=typeof d.source==="object"?d.source:nodeById[d.source]; const t=typeof d.target==="object"?d.target:nodeById[d.target]; return s&&t?(s.x+t.x)/2:0;})
          .attr("y", d=>{const s=typeof d.source==="object"?d.source:nodeById[d.source]; const t=typeof d.target==="object"?d.target:nodeById[d.target]; return s&&t?(s.y+t.y)/2:0;});

        nodeSel.attr("transform", d=>`translate(${d.x},${d.y})`);
      });

    // Drag
    nodeSel.call(d3.drag()
      .clickDistance(4)
      .on("start",(ev,d)=>{ if(!ev.active) simRef.current.alphaTarget(0.3).restart(); d.fx=d.x; d.fy=d.y; d._drag=false; })
      .on("drag",(ev,d)=>{ d.fx=ev.x; d.fy=ev.y; d._drag=true; })
      .on("end",(ev,d)=>{ if(!ev.active) simRef.current.alphaTarget(0); d.fx=null; d.fy=null; if(!d._drag) onNodeClick(d); d._drag=false; })
    );

    svgRef.current._nodeSel = nodeSel;
    svgRef.current._linkSel = linkSel;
    svgRef.current._nodeById = nodeById;

  }, [nodes, edges, onNodeClick]);

  useEffect(()=>{
    const t1=setTimeout(()=>draw(),60), t2=setTimeout(()=>draw(),300);
    return ()=>{ clearTimeout(t1); clearTimeout(t2); };
  },[draw]);

  useEffect(()=>{
    if(!wrapRef.current) return;
    const obs=new ResizeObserver(()=>draw()); obs.observe(wrapRef.current);
    return ()=>obs.disconnect();
  },[draw]);

  // Impact highlighting
  useEffect(()=>{
    if(!svgRef.current?._nodeSel) return;
    const ns=svgRef.current._nodeSel, ls=svgRef.current._linkSel, ha=affectedIds.length>0;

    ns.select(".node-bg")
      .attr("stroke",d=>affectedIds.includes(d.id)?"#E24B4A":d.id===selectedId?"#7F77DD":getTypeConfig(d.type).border)
      .attr("stroke-width",d=>affectedIds.includes(d.id)?2.5:d.id===selectedId?2:1)
      .attr("fill",d=>affectedIds.includes(d.id)?"#2a0808":d.id===selectedId?"#1a1540":ha?"#0f1018":getTypeConfig(d.type).bg)
      .attr("opacity",d=>!ha?1:affectedIds.includes(d.id)?1:0.2);

    ns.select(".node-glow")
      .attr("stroke",d=>affectedIds.includes(d.id)?"#E24B4A":d.id===selectedId?"#7F77DD":"transparent")
      .attr("opacity",d=>affectedIds.includes(d.id)||d.id===selectedId?0.7:0)
      .attr("filter",d=>affectedIds.includes(d.id)?"url(#glow-red)":d.id===selectedId?"url(#glow-selected)":"none");

    ns.select(".node-label")
      .attr("fill",d=>affectedIds.includes(d.id)?"#FF8080":!ha?getTypeConfig(d.type).color:"#2a2a3a");

    if(ls){
      ls.attr("stroke",d=>{
          const sid=typeof d.source==="object"?d.source.id:d.source;
          const tid=typeof d.target==="object"?d.target.id:d.target;
          const aff=affectedIds.includes(sid)||affectedIds.includes(tid);
          return aff&&ha?"#E24B4A":ha?"#1e1f2e":"#2e2f42";
        })
        .attr("stroke-width",d=>{
          const sid=typeof d.source==="object"?d.source.id:d.source;
          const tid=typeof d.target==="object"?d.target.id:d.target;
          return (affectedIds.includes(sid)||affectedIds.includes(tid))&&ha?2.5:1.5;
        })
        .attr("opacity",d=>{
          if(!ha) return 1;
          const sid=typeof d.source==="object"?d.source.id:d.source;
          const tid=typeof d.target==="object"?d.target.id:d.target;
          return affectedIds.includes(sid)||affectedIds.includes(tid)?1:0.05;
        })
        .attr("marker-end",d=>{
          const tid=typeof d.target==="object"?d.target.id:d.target;
          return affectedIds.includes(tid)&&ha?"url(#ar-red)":"url(#ar-default)";
        });
    }
  },[affectedIds,selectedId]);

  const nodeTypes = [...new Set(nodes?.map(n=>n.type)||[])];

  return (
    <div className="map-container" ref={wrapRef}>
      {/* Legend */}
      {showLegend && (
      <div className="map-legend">
        {nodeTypes.map(type=>{
          const c=TYPE_CONFIG[type]||DEFAULT_CFG;
          return (
            <div key={type} className="legend-item">
              <div className="legend-dot" style={{background:c.dot}}/>
              <span>{type}</span>
            </div>
          );
        })}
        {affectedIds.length>0&&(
          <div className="legend-item impact-legend">
            <div className="legend-dot" style={{background:"#E24B4A"}}/>
            <span>affected ({affectedIds.length})</span>
          </div>
        )}
      </div>
    )}

      {loadingImpact&&(
        <div className="impact-overlay-msg">
          <span className="impact-pulse"/> Bob is tracing dependencies…
        </div>
      )}

      {affectedIds.length>0&&!loadingImpact&&(
        <div className="impact-banner">
          <span className="impact-banner-icon">⚡</span>
          <span className="impact-banner-text">
            <strong>{affectedIds.length} step{affectedIds.length>1?"s":""} affected — </strong>
            {affectedIds.map((id,i)=>{const n=nodes?.find(nd=>nd.id===id); return(<span key={id} className="affected-name">{n?.label||id}{i<affectedIds.length-1?", ":""}</span>);})}
          </span>
        </div>
      )}

      {tooltip&&(
        <div className="node-tooltip" style={{left:tooltip.x,top:tooltip.y}}>
          <div className="tooltip-title">{tooltip.node.label}</div>
          <div className="tooltip-type">{tooltip.node.type?.toUpperCase()}</div>
          {tooltip.node.description&&<div className="tooltip-desc">{tooltip.node.description}</div>}
          {tooltip.node.file&&<div className="tooltip-file">{tooltip.node.file}</div>}
          {tooltip.node.file&&<div className="tooltip-hint">click to see functions & generate</div>}
        </div>
      )}

      <svg ref={svgRef} className="map-svg" style={{width:"100%",height:"100%"}}/>
    </div>
  );
}
