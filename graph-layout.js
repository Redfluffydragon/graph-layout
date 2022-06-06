class Graph {
  constructor(id, nodes = [], edges = []) {
    this.id = id;
    this.canvas = document.getElementById(id);
    this.ctx = this.canvas.getContext('2d');

    this.ctx.mozImageSmoothingEnabled = false;  // firefox
    this.ctx.imageSmoothingEnabled = false;

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

    this.hoveredNode = null;
    this.draggedNode = null;

    this.scale = 1;

    this.centerForce = 0.52; // force towards center
    this.repelForce = 10; // force between nodes
    this.linkForce = 1; // force on links
    this.linkDistance = 150; // min link distance?
    this.damping = 0.001;

    this.moveThreshold = -1;

    this.lastFrameTime = performance.now();
    this.frameDiff = 0;

    this.#setInitialPositions();
    this.render();

    this.canvas.addEventListener('mousemove', e => {
      this.#mouseMove(e);
    });

    this.canvas.addEventListener('mousedown', () => {
      this.draggedNode = this.hoveredNode;
    });

    this.canvas.addEventListener('mouseup', () => {
      this.draggedNode = null;
    });

    this.canvas.addEventListener('mouseleave', () => {
      this.draggedNode = null;
      this.hoveredNode = null;
    });

    this.canvas.addEventListener('wheel', (e) => {
      if (!e.ctrlKey) {
        return;
      }
      e.preventDefault();

      this.#clear();

      const factor = e.deltaY / -1250;
      this.scale = Math.min(Math.max(Math.round((this.scale + factor) * 10) / 10, 0.1), 20);

      const [x, y] = this.#offsetCoords(e.x, e.y)

      this.ctx.setTransform(this.scale, 0, 0, this.scale, this.#centerOn(this.centerNode.x), this.#centerOn(this.centerNode.y));
    });
  }

  get framerate() {
    return Math.ceil(1000 / this.frameDiff);
  }

  newNode({ label = 'test', size = 1, color = 'default' } = {}) {
    this.nodes.push({
      label,
      size,
      color,
      id: this.nextID,
      nextX: 0,
      nextY: 0,
      smoothX: 0,
      smoothY: 0,
    });

    this.nextID++;
  }

  newEdge(edge) {
    if (edge.length !== 2 || !Number.isInteger(edge[0]) || !Number.isInteger(edge[1])
      || edge[0] >= this.nextID || edge[1] >= this.nextID) {
      throw new Error('Error creating new edge: invalid edge.');
    }
    this.edges.push(edge);
  }

  #setInitialPositions() {
    for (const i of this.nodes) {
      i.x = Graph.rand(this.width * 0.2, this.width * 0.8);
      i.y = Graph.rand(this.height * 0.2, this.height * 0.8);
    }
  }

  render() {
    requestAnimationFrame(() => {
      this.render();
    });

    this.#clear();

    for (const edge of this.edges) {
      this.ctx.beginPath();
      this.ctx.moveTo(this.nodes[edge[0]].x, this.nodes[edge[0]].y);
      this.ctx.lineTo(this.nodes[edge[1]].x, this.nodes[edge[1]].y);
      this.ctx.stroke();
    }

    for (const i of this.nodes) {
      this.ctx.fillStyle = i === this.hoveredNode ? 'red' : 'black';

      this.ctx.beginPath();
      this.ctx.ellipse(i.x, i.y, 10, 10, 0, 0, 2 * Math.PI);
      this.ctx.fill();
    }

    this.#updatePositions();

    const now = performance.now();
    this.frameDiff = now - this.lastFrameTime;
    this.lastFrameTime = now;
  }

  #updatePositions() {
    // Calculate forces
    for (const targetNode of this.nodes) {
      for (const otherNode of this.nodes) {
        if (otherNode === targetNode) {
          continue;
        }
        this.#calcInternodeForce(targetNode, otherNode);
      }
      this.#calcCenterForce(targetNode);
    }

    for (const edge of this.edges) {
      this.#calcEdgeForce(edge);
    }

    // Apply forces
    for (const node of this.nodes) {
      if (this.#canApplyForces(node.nextX, node.nextY, node)) {
        node.x += this.#calcDamping(node.nextX, node.smoothX);
        node.y += this.#calcDamping(node.nextY, node.smoothY);

        node.smoothX = this.#vibrationDamping(node.nextX);
        node.smoothX = this.#vibrationDamping(node.nextY);
      }

      node.nextX = 0;
      node.nextY = 0;
    }
  }

  #calcInternodeForce(node1, node2) {
    const distance = this.dist(node1, node2);
    const force = this.repelForce * 500 / (distance ** 2);
    const [x, y] = this.#forceDirection(node1, node2, force);

    node1.nextX -= x;
    node1.nextY -= y;

    node2.nextX += x;
    node2.nextY += y;
  }

  #calcCenterForce(node) {
    const distance = this.dist(this.centerNode, node);
    const force = this.centerForce * 0.00008 * (distance ** 2);
    const [x, y] = this.#forceDirection(this.centerNode, node, force);

    node.nextX -= x;
    node.nextY -= y;
  }

  #calcEdgeForce(edge) {
    const node1 = this.nodes[edge[0]];
    const node2 = this.nodes[edge[1]];

    const edgeLength = this.dist(node1, node2);

    const force = (edgeLength - this.linkDistance) * 0.1 * this.linkForce ** 3;
    const [x, y] = this.#forceDirection(node1, node2, force);

    node1.nextX += x;
    node1.nextY += y;

    node2.nextX -= x;
    node2.nextY -= y;
  }

  /**
   * Returns the distance between two nodes
   * @param {*} node1 
   * @param {*} node2 
   * @returns {number}
   */
  dist(node1, node2) {
    return Math.sqrt((node1.x - node2.x) ** 2 + (node1.y - node2.y) ** 2);
  }

  /**
   * Given two nodes and a force, split the force into x and y components directed between the nodes
   * @param {*} node1 
   * @param {*} node2 
   * @param {number} force 
   * @returns {[number, number]}
   */
  #forceDirection(node1, node2, force) {
    const slope = (node1.y - node2.y) / (node1.x - node2.x);
    const angle = Math.tanh(slope);

    const reverse = node1.x > node2.x ? -1 : 1;

    const xForce = Math.cos(angle) * force * reverse;
    const yForce = Math.sin(angle) * force * reverse;


    return [this.#calcDamping(xForce), this.#calcDamping(yForce)];
  }

  #calcDamping(force, damping = this.damping) {
    const sign = Math.sign(force);
    const abs = Math.abs(force);
    return Math.max(abs - damping * abs ** 2, 0) * sign;
  }

  #vibrationDamping(force) {
    const abs = Math.abs(force);
    return abs < 2 ? 4 - abs ** 2 : 0;
  }

  #canApplyForces(x, y, node) {
    return Math.abs(x) > this.moveThreshold && Math.abs(y) > this.moveThreshold
      && node !== this.draggedNode;
  }

  #mouseMove(e) {
    const [x, y] = this.#offsetCoords(e.x, e.y);

    if (this.draggedNode !== null) {
      this.draggedNode.x = this.#scaleCoord(x, this.width);
      this.draggedNode.y = this.#scaleCoord(y, this.height);
      return;
    }

    this.hoveredNode = null;
    for (const node of this.nodes) {
      if (Math.abs(node.x - this.#scaleCoord(x, this.width)) < 10
        && Math.abs(node.y - this.#scaleCoord(y, this.height)) < 10) {
        this.hoveredNode = node;
      }
    }
  }

  #clear() {
    // save transforms
    this.ctx.save();
    // reset transforms and clear the whole canvas
    this.ctx.setTransform(1, 0, 0, 1, 0, 0);
    this.ctx.clearRect(0, 0, this.width, this.height);
    // restore transforms
    this.ctx.restore();
  }

  /**
   * @param {number} min
   * @param {number} max
   * @returns {number}
   */
  static rand(min, max) {
    return Math.random() * (max - min) + min;
  }

  /**
   * Converts coordinates relative to the window to coordinates relative to the canvas
   * @param {number} x 
   * @param {number} y 
   * @returns {[number, number]}
   */
  #offsetCoords(x, y) {
    return [
      x - this.canvas.offsetLeft,
      y - this.canvas.offsetTop,
    ]
  }

  #centerOn(dim) {
    return - (dim * (this.scale - 1));
  }

  #scaleCoord(coord, dim) {
    return coord / this.scale - ((dim * (1 - this.scale)) / this.scale) / 2;
  }
}
