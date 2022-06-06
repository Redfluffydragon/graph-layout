class Graph {
  constructor(id, nodes = [], edges = []) {
    this.id = id;
    this.canvas = document.getElementById(id);
    this.ctx = this.canvas.getContext('2d');
    this.ctx.fillStyle = 'red';

    this.width = this.canvas.clientWidth;
    this.height = this.canvas.clientHeight;
    this.centerNode = {
      x: this.width / 2,
      y: this.height / 2,
    }

    this.nextID = 0;

    this.nodes = [];
    nodes.forEach(node => this.newNode(node));

    this.edges = [];
    edges.forEach(edge => this.newEdge(edge));


    this.centerForce = 0.52; // force towards center
    this.repelForce = 10; // force between nodes
    this.linkForce = 1; // force on links
    this.linkDistance = 250; // max link distance?
    this.damping = 0.0001;

    this.moveThreshold = 0.1;

    this.firstRender();
  }

  newNode({ label = 'test', size = 1, color = 'default' } = {}) {
    this.nodes.push({
      label,
      size,
      color,
      id: this.nextID,
    });

    this.nextID++;
  }

  newEdge(edge) {
    this.edges.push(edge);
  }

  firstRender() {
    for (const i of this.nodes) {
      const x = this.rand(this.width * 0.2, this.width * 0.8);
      const y = this.rand(this.height * 0.2, this.height * 0.8);

      i.x = x;
      i.y = y;
    }

    this.render();
  }

  render() {
    this.ctx.clearRect(0, 0, this.width, this.height);

    for (const edge of this.edges) {
      this.ctx.beginPath();
      this.ctx.moveTo(this.nodes[edge[0]].x, this.nodes[edge[0]].y);
      this.ctx.lineTo(this.nodes[edge[1]].x, this.nodes[edge[1]].y);
      this.ctx.stroke();
    }

    this.ctx.beginPath();
    this.ctx.moveTo(this.centerNode.x, this.centerNode.y);
    this.ctx.lineTo(this.nodes[0].x, this.nodes[0].y);
    this.ctx.stroke();

    for (const i of this.nodes) {
      this.ctx.fillStyle = i.id ? 'red' : 'black';

      this.ctx.beginPath();
      this.ctx.ellipse(i.x, i.y, 10, 10, 0, 0, 2 * Math.PI);
      this.ctx.fill();
    }

    this.updateCoords();

    requestAnimationFrame(() => {
      this.render();
    });
  }

  updateCoords() {
    for (const i of this.nodes) {
      for (const j of this.nodes) {
        if (j === i) {
          continue;
        }
        this.calcInternodeForce(i, j);
      }
      this.calcCenterForce(i);
    }

    for (const i of this.edges) {
      this.calcEdgeForce(i);
    }
  }

  calcInternodeForce(node1, node2) {
    const distance = this.dist(node1, node2);
    const force = this.repelForce * 10000000 / (distance ** 4);
    const [x, y] = this.forceDirection(node1, node2, force);

    if (Math.abs(x) < this.moveThreshold && Math.abs(y) < this.moveThreshold) {
      return;
    }

    // console.log(x, y);

    node1.x -= x ;
    node1.y -= y ;
  }

  calcCenterForce(node) {
    const distance = this.dist(this.centerNode, node);
    const force = this.centerForce * 0.0001 * (distance ** 2);
    const [x, y] = this.forceDirection(this.centerNode, node, force);

    if (Math.abs(x) < this.moveThreshold && Math.abs(y) < this.moveThreshold) {
      return;
    }

    node.x -= x;
    node.y -= y;
  }

  calcEdgeForce(edge) {
    const node1 = this.nodes[edge[0]];
    const node2 = this.nodes[edge[1]];

    const edgeLength = this.dist(node1, node2);
    if (edgeLength <= this.linkDistance) {
      return;
    }

    const force = edgeLength * 0.0001 * this.linkForce;
    const [x, y] = this.forceDirection(node1, node2, force);

    node1.x -= x;
    node1.y -= y;

    node2.x += x;
    node2.y += y;
  }

  dist(node1, node2) {
    return Math.sqrt((node1.x - node2.x) ** 2 + (node1.y - node2.y) ** 2);
  }

  forceDirection(node1, node2, force) {
    const slope = (node1.y - node2.y) / (node1.x - node2.x);
    const angle = Math.tanh(slope);

    const reverse = node1.x > node2.x ? -1 : 1;

    const xForce = Math.cos(angle) * force * reverse;
    const yForce = Math.sin(angle) * force * reverse;


    return [this.applyDamping(xForce), this.applyDamping(yForce)];
  }

  applyDamping(force) {
    const sign = Math.sign(force);
    const abs = Math.abs(force);
    return (abs - this.damping) * sign;
  }

  /**
   * @param {number} min
   * @param {number} max
   * @returns {number}
   */
  rand(min, max) {
    return Math.random() * (max - min) + min;
  }
}
