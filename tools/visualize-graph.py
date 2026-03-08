#!/usr/bin/env python3
"""Generate an interactive knowledge graph visualization from a subject's graph.json.

Usage:
    python3 tools/visualize-graph.py                              # math-foundations (default)
    python3 tools/visualize-graph.py content/physics/graph.json   # any subject
    python3 tools/visualize-graph.py --open                       # generate and open in browser

Output: tools/visualize-graph.html (overwritten each run)
"""

import json
import sys
import os
import subprocess
import hashlib
from pathlib import Path

def infer_strand(topic_id: str) -> str:
    """Infer a strand/category from topic ID prefix patterns."""
    prefixes = [
        ('count-to', 'counting'), ('compare-numbers', 'counting'), ('compare-two', 'counting'),
        ('teen-', 'counting'), ('skip-count', 'counting'), ('odd-even', 'counting'),
        ('add-within', 'addition'), ('add-subtract-word', 'word-problems'),
        ('subtract-within', 'subtraction'),
        ('multi-digit-add', 'add-sub'), ('multi-step-word', 'word-problems'),
        ('multiply-word', 'word-problems'), ('division-word', 'word-problems'),
        ('intro-array', 'multiplication'), ('properties-of-mult', 'multiplication'),
        ('multiply-within', 'multiplication'), ('multi-digit-mult', 'multiplication'),
        ('multiply-multi', 'multiplication'), ('order-of-op', 'multiplication'),
        ('divide-within', 'division'), ('long-div', 'division'),
        ('divide-multi', 'division'), ('factors-', 'division'),
        ('intro-frac', 'fractions'), ('fractions-', 'fractions'),
        ('equivalent-frac', 'fractions'), ('compare-frac', 'fractions'),
        ('add-subtract-frac', 'fractions'), ('multiply-frac', 'fractions'),
        ('divide-frac', 'fractions'),
        ('decimal', 'decimals'),
        ('place-value', 'place-value'),
        ('shapes-', 'geometry'), ('classify-', 'geometry'), ('line-sym', 'geometry'),
        ('angles-', 'geometry'), ('coordinate-', 'geometry'),
        ('measure-', 'measurement'), ('perimeter', 'measurement'),
        ('area-', 'measurement'), ('volume', 'measurement'), ('unit-conv', 'measurement'),
        ('tell-time', 'time-money'), ('money-', 'time-money'),
        ('bar-graph', 'data'), ('line-plot', 'data'),
        ('pattern', 'algebra'), ('variable', 'algebra'),
    ]
    for prefix, strand in prefixes:
        if topic_id.startswith(prefix):
            return strand
    # Fallback: use first word before hyphen
    return topic_id.split('-')[0]


# 15 distinct colors for strands
PALETTE = [
    '#f97316', '#22c55e', '#ef4444', '#84cc16', '#eab308',
    '#3b82f6', '#8b5cf6', '#ec4899', '#f43f5e', '#14b8a6',
    '#06b6d4', '#a855f7', '#78716c', '#64748b', '#f59e0b',
    '#10b981', '#e879f9', '#fb923c', '#38bdf8', '#4ade80',
]


def generate(graph_path: str, output_path: str):
    with open(graph_path) as f:
        g = json.load(f)

    subject_name = g.get('subjectName', Path(graph_path).parent.name)
    topics = g['topics']
    prereqs = g['prerequisites']
    encomp = g.get('encompassings', [])

    # Assign strands and colors
    strands_seen = []
    strand_color = {}
    for t in topics:
        s = infer_strand(t['id'])
        t['_strand'] = s
        if s not in strand_color:
            strand_color[s] = PALETTE[len(strands_seen) % len(PALETTE)]
            strands_seen.append(s)

    compact = json.dumps({
        'topics': [{'id': t['id'], 'name': t['name'], 'description': t.get('description',''),
                     'gradeLevel': t.get('gradeLevel', 0), 'standardCode': t.get('standardCode',''),
                     'strand': t['_strand']} for t in topics],
        'prerequisites': prereqs,
        'encompassings': encomp,
    }, separators=(',', ':'))

    sc_json = json.dumps(strand_color, separators=(',', ':'))

    html = f'''<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>{subject_name} — Knowledge Graph</title>
<style>
  * {{ margin: 0; padding: 0; box-sizing: border-box; }}
  body {{ font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif; background: #0c1222; color: #e2e8f0; overflow: hidden; }}
  #controls {{ position: fixed; top: 0; left: 0; right: 0; z-index: 10; background: #1e293bee; backdrop-filter: blur(8px); border-bottom: 1px solid #334155; padding: 10px 20px; display: flex; gap: 14px; align-items: center; flex-wrap: wrap; }}
  #controls h1 {{ font-size: 14px; font-weight: 600; color: #f8fafc; margin-right: 4px; white-space: nowrap; }}
  .ctrl {{ display: flex; align-items: center; gap: 5px; }}
  .ctrl label {{ font-size: 11px; color: #94a3b8; white-space: nowrap; }}
  .tog {{ appearance: none; width: 32px; height: 18px; background: #475569; border-radius: 9px; position: relative; cursor: pointer; transition: background 0.2s; flex-shrink: 0; }}
  .tog:checked {{ background: #3b82f6; }}
  .tog::after {{ content: ''; position: absolute; width: 14px; height: 14px; background: #f8fafc; border-radius: 50%; top: 2px; left: 2px; transition: transform 0.2s; }}
  .tog:checked::after {{ transform: translateX(14px); }}
  select {{ background: #334155; color: #e2e8f0; border: 1px solid #475569; border-radius: 5px; padding: 3px 6px; font-size: 11px; cursor: pointer; }}
  .stats {{ font-size: 10px; color: #64748b; margin-left: auto; display: flex; gap: 10px; }}
  .stats span {{ white-space: nowrap; }}
  .sv {{ color: #94a3b8; font-weight: 500; }}
  #tip {{ position: fixed; pointer-events: none; background: #1e293bf0; border: 1px solid #475569; border-radius: 8px; padding: 10px 14px; font-size: 12px; max-width: 300px; z-index: 20; box-shadow: 0 8px 24px rgba(0,0,0,0.5); display: none; line-height: 1.4; }}
  #tip .tn {{ font-weight: 600; font-size: 13px; margin-bottom: 2px; }}
  #tip .ti {{ font-size: 10px; color: #64748b; font-family: monospace; margin-bottom: 4px; }}
  #tip .td {{ color: #94a3b8; margin-bottom: 6px; }}
  #tip .tm {{ font-size: 10px; color: #64748b; margin-bottom: 6px; }}
  #tip .tm span {{ margin-right: 8px; }}
  #tip .te {{ font-size: 10px; }}
  #tip .te dt {{ color: #64748b; margin-top: 3px; }}
  #tip .te dd {{ color: #cbd5e1; margin-left: 6px; }}
  #legend {{ position: fixed; bottom: 12px; left: 12px; z-index: 10; background: #1e293bee; backdrop-filter: blur(8px); border: 1px solid #334155; border-radius: 8px; padding: 10px 14px; font-size: 10px; max-height: calc(100vh - 80px); overflow-y: auto; }}
  #legend h3 {{ font-size: 11px; margin-bottom: 6px; color: #94a3b8; }}
  .li {{ display: flex; align-items: center; gap: 6px; margin-bottom: 3px; color: #cbd5e1; }}
  .ls {{ width: 10px; height: 10px; border-radius: 2px; flex-shrink: 0; }}
  .ll {{ width: 20px; height: 0; flex-shrink: 0; }}
  svg {{ display: block; }}
  .edge-prereq {{ fill: none; stroke: #3b82f640; stroke-width: 1.5; }}
  .edge-prereq.hl {{ stroke: #60a5fa; stroke-width: 2.5; }}
  .edge-encomp {{ fill: none; stroke-width: 1; stroke-dasharray: 3 2; opacity: 0.35; }}
  .edge-encomp.hl {{ opacity: 1; stroke-width: 2; }}
  .edge-encomp.hidden {{ display: none; }}
  .edge-prereq.hidden {{ display: none; }}
  .node-g {{ cursor: pointer; }}
  .node-g.dimmed {{ opacity: 0.08; }}
  .edge-prereq.dimmed, .edge-encomp.dimmed {{ opacity: 0.03; }}
  .node-pill {{ rx: 12; ry: 12; stroke-width: 1.5; }}
  .node-label {{ font-size: 9px; fill: #f0f0f0; text-anchor: middle; dominant-baseline: central; pointer-events: none; font-weight: 500; }}
</style>
</head>
<body>
<div id="controls">
  <h1>{subject_name} Graph</h1>
  <div class="ctrl"><label>Prerequisites</label><input type="checkbox" class="tog" id="showP" checked></div>
  <div class="ctrl"><label>Encompassing</label><input type="checkbox" class="tog" id="showE"></div>
  <div class="ctrl"><label>Strand</label><select id="sf"><option value="all">All</option></select></div>
  <div class="stats">
    <span>Topics: <span class="sv" id="sT">0</span></span>
    <span>Prereqs: <span class="sv" id="sP">0</span></span>
    <span>Encomp: <span class="sv" id="sE">0</span></span>
    <span>Density: <span class="sv" id="sD">0</span></span>
  </div>
</div>
<div id="tip"></div>
<div id="legend">
  <h3>Edge Types</h3>
  <div class="li"><div class="ll" style="border-top:2px solid #3b82f680"></div>Prerequisite</div>
  <div class="li"><div class="ll" style="border-top:1.5px dashed #22d3ee66"></div>Encompassing</div>
  <h3 style="margin-top:6px">Strands</h3>
  <div id="ls"></div>
</div>
<script src="https://d3js.org/d3.v7.min.js"></script>
<script src="https://unpkg.com/@dagrejs/dagre@1.1.4/dist/dagre.min.js"></script>
<script>
const GRAPH_DATA = {compact};
const SC = {sc_json};

(function main() {{
  const graph = GRAPH_DATA;
  const W = window.innerWidth, H = window.innerHeight;

  const dg = new dagre.graphlib.Graph();
  dg.setGraph({{ rankdir: 'BT', nodesep: 28, ranksep: 60, marginx: 40, marginy: 60 }});
  dg.setDefaultEdgeLabel(() => ({{}}));

  const nodeMap = {{}};
  graph.topics.forEach(t => {{
    const label = t.name.length > 22 ? t.name.slice(0, 20) + '\\u2026' : t.name;
    const w = Math.max(90, label.length * 6.5 + 20);
    dg.setNode(t.id, {{ label, width: w, height: 28 }});
    nodeMap[t.id] = {{ ...t, displayName: label, w }};
  }});

  graph.prerequisites.forEach(p => {{ dg.setEdge(p.from, p.to); }});
  dagre.layout(dg);

  const nodes = [];
  dg.nodes().forEach(id => {{
    const n = dg.node(id);
    const meta = nodeMap[id];
    nodes.push({{ id, x: n.x, y: n.y, w: n.width, h: n.height, ...meta }});
  }});

  const prereqEdges = [];
  graph.prerequisites.forEach(p => {{
    const edge = dg.edge(p.from, p.to);
    prereqEdges.push({{ source: p.from, target: p.to, points: edge.points }});
  }});

  const nodePos = {{}};
  nodes.forEach(n => {{ nodePos[n.id] = {{ x: n.x, y: n.y, h: n.h }}; }});

  const encompEdges = graph.encompassings.map(e => ({{
    source: e.parent, target: e.child, weight: e.weight,
    sx: nodePos[e.parent]?.x || 0, sy: (nodePos[e.parent]?.y || 0) + 14,
    tx: nodePos[e.child]?.x || 0, ty: (nodePos[e.child]?.y || 0) - 14,
  }}));

  const adjE = {{}}, adjP = {{}};
  graph.encompassings.forEach(e => {{
    (adjE[e.parent] ??= []).push({{ id: e.child, w: e.weight, dir: 'child' }});
    (adjE[e.child] ??= []).push({{ id: e.parent, w: e.weight, dir: 'parent' }});
  }});
  graph.prerequisites.forEach(p => {{
    (adjP[p.to] ??= []).push({{ id: p.from, dir: 'requires' }});
    (adjP[p.from] ??= []).push({{ id: p.to, dir: 'unlocks' }});
  }});

  document.getElementById('sT').textContent = nodes.length;
  document.getElementById('sP').textContent = prereqEdges.length;
  document.getElementById('sE').textContent = encompEdges.length;
  document.getElementById('sD').textContent = (encompEdges.length / Math.max(nodes.length, 1)).toFixed(1);

  const strands = [...new Set(nodes.map(n => n.strand))].sort();
  const sf = document.getElementById('sf');
  strands.forEach(s => {{ const o = document.createElement('option'); o.value = s; o.textContent = s; sf.appendChild(o); }});
  const ls = document.getElementById('ls');
  strands.forEach(s => {{
    const d = document.createElement('div'); d.className = 'li';
    d.innerHTML = '<div class="ls" style="background:' + (SC[s]||'#666') + '"></div>' + s;
    ls.appendChild(d);
  }});

  const svg = d3.select('body').append('svg').attr('width', W).attr('height', H);
  const gRoot = svg.append('g');
  const zoom = d3.zoom().scaleExtent([0.15, 3]).on('zoom', e => gRoot.attr('transform', e.transform));
  svg.call(zoom);

  const defs = svg.append('defs');
  [['ap','#3b82f680',8],['aph','#60a5fa',8],['ae','#22d3ee44',6],['aeh','#22d3ee',6]].forEach(([id,fill,sz]) => {{
    defs.append('marker').attr('id',id).attr('viewBox','0 -3 6 6')
      .attr('refX',6).attr('refY',0).attr('markerWidth',sz).attr('markerHeight',sz)
      .attr('orient','auto').append('path').attr('d','M0,-2.5L6,0L0,2.5').attr('fill',fill);
  }});

  const line = d3.line().x(d=>d.x).y(d=>d.y).curve(d3.curveBasis);
  const edgeG = gRoot.append('g');

  const pEdgeSel = edgeG.selectAll('.edge-prereq').data(prereqEdges).enter().append('path')
    .attr('class', 'edge-prereq').attr('d', d => line(d.points)).attr('marker-end', 'url(#ap)');

  const eEdgeSel = edgeG.selectAll('.edge-encomp').data(encompEdges).enter().append('path')
    .attr('class', 'edge-encomp hidden')
    .attr('stroke', d => (SC[nodeMap[d.source]?.strand] || '#22d3ee') + '66')
    .attr('d', d => {{
      const dx = d.tx - d.sx, dy = d.ty - d.sy;
      const cx = (d.sx + d.tx) / 2 + dy * 0.15;
      const cy = (d.sy + d.ty) / 2 - dx * 0.08;
      return 'M' + d.sx + ',' + d.sy + ' Q' + cx + ',' + cy + ' ' + d.tx + ',' + d.ty;
    }}).attr('marker-end', 'url(#ae)');

  const nodeG = gRoot.append('g');
  const nodeSel = nodeG.selectAll('.node-g').data(nodes).enter().append('g')
    .attr('class', 'node-g').attr('transform', d => 'translate(' + d.x + ',' + d.y + ')');

  nodeSel.append('rect').attr('class', 'node-pill')
    .attr('x', d => -d.w/2).attr('y', -14).attr('width', d => d.w).attr('height', 28)
    .attr('fill', d => {{ const c = d3.color(SC[d.strand] || '#666'); c.opacity = 0.8; return c + ''; }})
    .attr('stroke', d => {{ const c = d3.color(SC[d.strand] || '#666').brighter(0.6); c.opacity = 0.5; return c + ''; }});

  nodeSel.append('text').attr('class', 'node-label').text(d => d.displayName);

  const tip = document.getElementById('tip');
  nodeSel.on('mouseover', (ev, d) => {{
    const conn = new Set([d.id]);
    const connP = new Set(), connE = new Set();
    prereqEdges.forEach((e, i) => {{ if (e.source === d.id || e.target === d.id) {{ conn.add(e.source); conn.add(e.target); connP.add(i); }} }});
    encompEdges.forEach((e, i) => {{ if (e.source === d.id || e.target === d.id) {{ conn.add(e.source); conn.add(e.target); connE.add(i); }} }});
    nodeSel.classed('dimmed', n => !conn.has(n.id));
    pEdgeSel.classed('dimmed', (_, i) => !connP.has(i)).classed('hl', (_, i) => connP.has(i))
      .attr('marker-end', (_, i) => connP.has(i) ? 'url(#aph)' : 'url(#ap)');
    eEdgeSel.classed('dimmed', (_, i) => !connE.has(i)).classed('hl', (_, i) => connE.has(i))
      .attr('marker-end', (_, i) => connE.has(i) ? 'url(#aeh)' : 'url(#ae)');
    const pr = (adjP[d.id]||[]).filter(x=>x.dir==='requires');
    const ul = (adjP[d.id]||[]).filter(x=>x.dir==='unlocks');
    const ep = (adjE[d.id]||[]).filter(x=>x.dir==='parent');
    const ec = (adjE[d.id]||[]).filter(x=>x.dir==='child');
    let h = '<div class="tn">' + d.name + '</div><div class="ti">' + d.id + '</div>';
    h += '<div class="td">' + d.description + '</div>';
    h += '<div class="tm"><span>Grade ' + d.gradeLevel + '</span><span>' + d.standardCode + '</span><span style="color:' + (SC[d.strand]||'#888') + '">' + d.strand + '</span></div>';
    h += '<dl class="te">';
    if (pr.length) h += '<dt>Requires (' + pr.length + '):</dt><dd>' + pr.map(x=>(nodeMap[x.id]?.name||x.id)).join(', ') + '</dd>';
    if (ul.length) h += '<dt>Unlocks (' + ul.length + '):</dt><dd>' + ul.map(x=>(nodeMap[x.id]?.name||x.id)).join(', ') + '</dd>';
    if (ep.length) h += '<dt>Encompassed by (' + ep.length + '):</dt><dd>' + ep.map(x=>(nodeMap[x.id]?.name||x.id) + ' (' + x.w + ')').join(', ') + '</dd>';
    if (ec.length) h += '<dt>Encompasses (' + ec.length + '):</dt><dd>' + ec.map(x=>(nodeMap[x.id]?.name||x.id) + ' (' + x.w + ')').join(', ') + '</dd>';
    h += '</dl>';
    tip.innerHTML = h; tip.style.display = 'block';
  }})
  .on('mousemove', ev => {{
    let x = ev.clientX + 14, y = ev.clientY - 8;
    if (x + tip.offsetWidth > W) x = ev.clientX - tip.offsetWidth - 10;
    if (y + tip.offsetHeight > H) y = H - tip.offsetHeight - 8;
    tip.style.left = x + 'px'; tip.style.top = y + 'px';
  }})
  .on('mouseout', () => {{
    nodeSel.classed('dimmed', false);
    pEdgeSel.classed('dimmed', false).classed('hl', false).attr('marker-end', 'url(#ap)');
    eEdgeSel.classed('dimmed', false).classed('hl', false).attr('marker-end', 'url(#ae)');
    tip.style.display = 'none';
  }});

  function applyFilters() {{
    const strand = sf.value;
    const showP = document.getElementById('showP').checked;
    const showE = document.getElementById('showE').checked;
    const vis = new Set();
    nodes.forEach(n => {{ if (strand === 'all' || n.strand === strand) vis.add(n.id); }});
    nodeSel.style('display', n => vis.has(n.id) ? null : 'none');
    pEdgeSel.classed('hidden', d => !showP || !vis.has(d.source) || !vis.has(d.target));
    eEdgeSel.classed('hidden', d => !showE || !vis.has(d.source) || !vis.has(d.target));
  }}
  document.getElementById('showP').addEventListener('change', applyFilters);
  document.getElementById('showE').addEventListener('change', applyFilters);
  sf.addEventListener('change', applyFilters);
  applyFilters();

  const gBox = dg.graph();
  const gw = gBox.width || 1200, gh = gBox.height || 800;
  const scale = Math.min(0.92 * W / gw, 0.88 * (H - 50) / gh, 1.2);
  const tx = (W - gw * scale) / 2, ty = (H - 50 - gh * scale) / 2 + 50;
  svg.call(zoom.transform, d3.zoomIdentity.translate(tx, ty).scale(scale));
}})();
</script>
</body>
</html>'''

    with open(output_path, 'w') as f:
        f.write(html)

    print(f"Generated: {output_path}")
    print(f"  Subject: {subject_name}")
    print(f"  Topics: {len(topics)}, Prerequisites: {len(prereqs)}, Encompassings: {len(encomp)}")
    print(f"  Strands: {', '.join(strands_seen)}")
    return output_path


if __name__ == '__main__':
    graph_path = 'content/math-foundations/graph.json'
    do_open = False

    for arg in sys.argv[1:]:
        if arg == '--open':
            do_open = True
        elif arg.endswith('.json'):
            graph_path = arg
        else:
            # Treat as subject dir name
            candidate = f'content/{arg}/graph.json'
            if os.path.exists(candidate):
                graph_path = candidate
            else:
                print(f"Error: Cannot find {candidate} or {arg}")
                sys.exit(1)

    if not os.path.exists(graph_path):
        print(f"Error: {graph_path} not found")
        sys.exit(1)

    output = generate(graph_path, 'tools/visualize-graph.html')

    if do_open:
        subprocess.run(['open', output])
