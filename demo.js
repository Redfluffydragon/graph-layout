
const graph = new Graph('demo', {
  nodeColor: 'gray',
  // hoverColor: 'rgb(158, 105, 255)',
  hoverColor: 'rgb(186, 15, 15)',
  textColor: 'gray',
  background: '#191919',
});

graph.cursorDot = true;

const nodes = [];
for (let i = 0; i < 200; i++) {
  nodes.push(graph.newNode({
    autoSize: true,
    edges: new Set(preNodes[i]),
    color: i < 4 ? 'turquoise' : '',
  }));
}

graph.updateEdges();

function randn_bm() {
  let u = 0, v = 0;
  while (u === 0) u = Math.random(); //Converting [0,1) to (0,1)
  while (v === 0) v = Math.random();
  let num = Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
  num = num / 10.0 + 0.5; // Translate to 0 -> 1
  if (num > 1 || num < 0) return randn_bm() // resample between 0 and 1
  return num
}

for (let i = 0; i < 250; i++) {
  const node1 = nodes[Math.trunc(randn_bm() * nodes.length)];
  const node2 = nodes[Math.trunc(Math.random() * nodes.length)];
  if (node1 !== node2) {
    graph.newEdge(node1, node2);
  }
}

for (const node of graph.nodes) {
  if (node.edges.size < 2) {
    graph.newEdge(node, graph.nodes[Math.random() < 0.75 ? 0 : 1]);
  }
}

const edges = [];

graph.nodes.forEach(node => {
  edges.push([...node.edges]);
});

graph.render();

const framerateDisplay = document.getElementById('framerate');

setInterval(() => {
  framerateDisplay.innerText = graph.framerate;
}, 500);
