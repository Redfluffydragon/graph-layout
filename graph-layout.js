class Graph {
  #pageScale;
  #startDragX;
  #startDragY;
  #nextID;
  #nodes;
  #edges;
  #hoveredNode;
  #draggedNode;
  #dragging;
  #lastFrameTime;
  #frameDiff;
  #mouseNode;
  #animation;
  #frameCount;

  constructor(canvas, {
    nodeColor = 'gray',
    hoverColor = '#ba0f0f',
    edgeColor = 'darkgray',
    textColor = '#dddd',
    background = '',
    font = 'bold 1rem Segoe UI',
    minTextScale = 0.5,
    saveZoom = true,
    autoSize,
  } = {}) {
    this.canvas = typeof canvas === 'string'
      ? document.getElementById(canvas)
      : canvas;

    this.width = this.canvas.clientWidth;
    this.height = this.canvas.clientHeight;
    this.centerNode = {
      x: this.width / 2,
      y: this.height / 2,
    };

    this.ctx = this.canvas.getContext('2d');
    this.ctx.textAlign = 'center';
    this.ctx.font = font;

    this.nodeColor = nodeColor;
    this.hoverColor = hoverColor;
    this.edgeColor = edgeColor;
    this.textColor = textColor;
    this.background = background;
    this.canvas.style.background = background;
    this.minTextScale = minTextScale;

    this.ctx.imageSmoothingEnabled = false;

    this.scale = 1;
    this.saveZoom = saveZoom;
    if (this.saveZoom) {
      this.scale = isNaN(localStorage.getItem('scale'))
        ? 1
        : parseFloat(localStorage.getItem('scale'));
    }

    this.#pageScale = this.width / this.canvas.width;

    this.#startDragX = 0;
    this.#startDragY = 0;

    this.#setInitialTransform();

    this.#nextID = 0;

    this.#nodes = [];

    this.#edges = new Set;

    this.#hoveredNode = null;
    this.#draggedNode = null;
    this.#dragging = false;

    this.centerForce = 0.5; // force towards center
    this.repelForce = 10; // force between nodes
    this.linkForce = 1; // force on links
    this.linkDistance = 150; // min link distance?
    this.damping = 0.01;

    if (autoSize && typeof autoSize === 'function') {
      this.autoSize = autoSize;
    }

    this.#lastFrameTime = performance.now();
    this.#frameDiff = 0;

    this.cursorDot = false;
    this.#mouseNode = {
      x: 0,
      y: 0,
    };

    this.outlineCanvas = false;
    this.centerDot = false;
    this.actualCenterDot = false;

    this.#animation = null;
    this.#frameCount = 0;

    this.canvas.addEventListener('mousemove', e => {
      this.#mouseMove(e);
    });

    this.canvas.addEventListener('mousedown', (e) => {
      this.#mouseDown(e);
    });

    this.canvas.addEventListener('mouseup', () => {
      this.#mouseUp();
    });

    this.canvas.addEventListener('mouseleave', () => {
      this.#mouseLeave();
    });

    this.canvas.addEventListener('wheel', (e) => {
      this.#zoom(e);
    });

    addEventListener('resize', () => {
      this.#resize();
    })
  }

  get framerate() {
    return Math.ceil(1000 / this.#frameDiff);
  }

  /** The current canvas context transform */
  get transform() {
    return this.ctx.getTransform();
  }

  /** The node currently being hovered over, or null otherwise */
  get hoveredNode() {
    return this.#hoveredNode;
  }

  /** The node currently being dragged, or null otherwise */
  get draggedNode() {
    return this.#draggedNode;
  }

  /** An array of all the nodes on the graph */
  get nodes() {
    return this.#nodes;
  }

  /**
   * Create a new node
   * @param {*} options
   * @param {string} options.label A text label for the node
   * @param {number} options.size A size in pixels for the node
   * @param {string} options.color A CSS color for the node
   * @param {Set} options.edges A Set of other node IDs for the node to be connected to
   */
  newNode({ label = '', size = 10, color = '', edges = new Set, autoSize = false } = {}) {
    const node = {
      label,
      size,
      color,
      edges,
      autoSize,
      id: this.#nextID,
      x: Graph.rand(this.width * 0.2, this.width * 0.8),
      y: Graph.rand(this.height * 0.2, this.height * 0.8),
      nextX: 0,
      nextY: 0,
      lastX: 0,
      lastY: 0,
    }

    edges.forEach(id => {
      this.#edges.add([node.id, id])
    });

    if (autoSize) {
      node.size = this.autoSize(node);
    }

    this.#nodes.push(node);

    this.#nextID++;

    return node;
  }

  /**
   * Remove a specific node and all edges attached to that node
   * @param {*} node The node to be removed
   */
  removeNode(node) {
    this.#nodes = this.#nodes.filter(n => n !== node);
    this.#nodes.forEach(n => {
      n.edges.delete(node.id);
      this.#updateSizes(n);
    });

    this.#edges.forEach(edge => {
      if (edge.includes(node.id)) {
        this.#edges.delete(edge);
      }
    });
  }

  /**
   * Add an edge between the two nodes
   * @param {*} node1 
   * @param {*} node2 
   */
  newEdge(node1, node2) {
    node1.edges.add(node2.id);
    node2.edges.add(node1.id);

    this.#updateSizes(node1, node2);

    this.#edges.add([node1.id, node2.id]);
  }

  /**
   * Remove any edge between the two given nodes
   * @param {*} node1 
   * @param {*} node2 
   */
  removeEdge(node1, node2) {
    node1.edges.delete(node2.id);
    node2.edges.delete(node1.id);

    this.#updateSizes(node1, node2);

    // I think this is faster maybe? (not that it matters much)
    this.#edges.delete([node1.id, node2.id]);
    this.#edges.delete([node2.id, node1.id]);
  }

  updateEdges() {
    this.#nodes.forEach(node => {
      node.edges.forEach(edge => {
        this.newEdge(node, this.#nodes[edge]);
      });
    });
  }

  /** Start the graph rendering */
  render() {
    this.#animation = requestAnimationFrame(() => {
      this.render();
    });

    this.#clearCanvas();

    this.ctx.lineWidth = 1;
    for (const edge of this.#edges) {
      if (edge[0] !== this.#hoveredNode?.id && edge[1] !== this.#hoveredNode?.id) {
        this.ctx.strokeStyle = this.edgeColor;
        this.ctx.beginPath();
        this.ctx.moveTo(this.#nodes[edge[0]].x, this.#nodes[edge[0]].y);
        this.ctx.lineTo(this.#nodes[edge[1]].x, this.#nodes[edge[1]].y);
        this.ctx.stroke();
      }
    }

    for (const node of this.#nodes) {
      this.ctx.fillStyle = node === this.#hoveredNode || node.edges.has(this.#hoveredNode?.id)
        ? this.hoverColor
        : (node.color || this.nodeColor);

      if (node !== this.#hoveredNode && !node.edges.has(this.#hoveredNode?.id)) {

        this.ctx.fillStyle = (node.color || this.nodeColor);
        this.ctx.beginPath();
        this.ctx.ellipse(node.x, node.y, node.size, node.size, 0, 0, 2 * Math.PI);
        this.ctx.fill();
        if (node === this.#hoveredNode) {
          this.ctx.lineWidth = 2;
          this.ctx.stroke();
        }

        if (this.scale > this.minTextScale && node.label) {
          this.ctx.fillStyle = this.textColor;
          this.ctx.fillText(node.label, node.x, node.y + node.size + 15);
        }
      }
    }

    if (this.centerDot) {
      this.ctx.fillStyle = 'blue';
      this.ctx.beginPath();
      this.ctx.ellipse(this.width / 2, this.height / 2, 10, 10, 0, 0, 2 * Math.PI);
      this.ctx.fill();
    }

    if (this.actualCenterDot) {
      this.ctx.fillStyle = 'green';
      this.ctx.beginPath();
      this.ctx.ellipse(this.#actualCenter('x'), this.#actualCenter('y'), 10, 10, 0, 0, 2 * Math.PI);
      this.ctx.fill();
    }

    if (this.outlineCanvas) {
      this.ctx.strokeStyle = 'white';
      this.ctx.strokeRect(0, 0, this.width, this.height);
      this.ctx.stroke();
    }


    // draw hovered and connected nodes on top of shaded rectangle
    if (this.#hoveredNode !== null) {
      this.ctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
      this.ctx.save();
      this.ctx.setTransform(1, 0, 0, 1, 0, 0);
      this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
      this.ctx.restore();

      this.ctx.lineWidth = 1;
      for (const edge of this.#edges) {
        if (edge[0] === this.#hoveredNode?.id || edge[1] === this.#hoveredNode?.id) {
          this.ctx.strokeStyle = this.hoverColor;
          this.ctx.beginPath();
          this.ctx.moveTo(this.#nodes[edge[0]].x, this.#nodes[edge[0]].y);
          this.ctx.lineTo(this.#nodes[edge[1]].x, this.#nodes[edge[1]].y);
          this.ctx.stroke();
        }
      }

      for (const node of this.#nodes) {
        if (node === this.#hoveredNode || node.edges.has(this.#hoveredNode?.id)) {
          this.ctx.fillStyle = this.hoverColor;
          this.ctx.beginPath();
          this.ctx.ellipse(node.x, node.y, node.size, node.size, 0, 0, 2 * Math.PI);
          this.ctx.fill();
          if (node === this.#hoveredNode) {
            this.ctx.strokeStyle = this.textColor;
            this.ctx.lineWidth = 2;
            this.ctx.stroke();
          }

          if (this.scale > this.minTextScale && node.label) {
            this.ctx.fillStyle = this.textColor;
            this.ctx.fillText(node.label, node.x, node.y + node.size + 15);
          }
        }
      }
    }

    if (this.cursorDot) {
      this.ctx.fillStyle = 'purple';
      this.ctx.beginPath();
      this.ctx.ellipse(this.#mouseNode.x, this.#mouseNode.y, 10, 10, 0, 0, 2 * Math.PI);
      this.ctx.fill();
    }

    this.#updatePositions();

    if (this.#frameCount < 15) {
      for (let i = 0; i < Math.round(- 200 / (1 + Math.exp(- this.#frameCount / 2)) + 200); i++) {
        this.#updatePositions();
      }
      this.#frameCount++;
    }

    const now = performance.now();
    this.#frameDiff = now - this.#lastFrameTime;
    this.#lastFrameTime = now;
  }

  /** Stop the graph rendering */
  stop() {
    cancelAnimationFrame(this.#animation);
  }

  #updatePositions() {
    // Calculate forces
    for (const targetNode of this.#nodes) {
      this.#calcCenterForce(targetNode);

      for (const otherNode of this.#nodes) {
        if (otherNode !== targetNode) {
          this.#calcInternodeForce(targetNode, otherNode);
        }
      }
    }

    for (const edge of this.#edges) {
      this.#calcEdgeForce(edge);
    }

    // Apply forces
    for (const node of this.#nodes) {
      if (this.#canApplyForces(node)) {
        // use the average of the last one and the current one for a little more stability/smoothness/damping
        const x = (node.nextX + node.lastX) / 2;
        const y = (node.nextY + node.lastY) / 2;

        node.x += Math.round(x * 100) / 100;
        node.y += Math.round(y * 100) / 100;

        node.lastX = x;
        node.lastY = y;
      }
      else {
        node.lastX = 0;
        node.lastY = 0;
      }

      // reset so new forces can be added
      node.nextX = 0;
      node.nextY = 0;
    }
  }

  #calcInternodeForce(node1, node2) {
    const distance = this.dist(node1, node2) - node1.size - node2.size;
    const force = Math.min(this.repelForce * 2000 / (distance ** 2), 50);
    const [x, y] = this.#forceDirection(node1, node2, force);

    node1.nextX -= x;
    node1.nextY -= y;

    node2.nextX += x;
    node2.nextY += y;
  }

  #calcCenterForce(node) {
    const distance = this.dist(this.centerNode, node);
    const force = this.centerForce * 0.00001 * (distance ** 2);
    const [x, y] = this.#forceDirection(this.centerNode, node, force);

    node.nextX -= x;
    node.nextY -= y;
  }

  #calcEdgeForce(edge) {
    const node1 = this.#nodes[edge[0]];
    const node2 = this.#nodes[edge[1]];

    const edgeLength = this.dist(node1, node2);

    const force = Math.min(this.linkDistance - edgeLength, 0) * 0.01 * this.linkForce ** 3;
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
   * @param {'x'|'y'} type 
   * @returns {number}
   */
  #actualCenter(type) {
    return type === 'x'
      ? (this.centerNode.x - this.transform.e) / this.scale + (this.canvas.height - this.height) / this.scale / 2
      : (this.centerNode.y - this.transform.f) / this.scale + (this.canvas.width - this.width) / this.scale / 2;
  }

  /**
   * Given two nodes and a force, split the force into x and y components directed between the nodes
   * @param {*} node1 
   * @param {*} node2 
   * @param {number} force 
   * @returns {[number, number]}
   */
  #forceDirection(node1, node2, force) {
    force = this.#calcDamping(force);

    const rise = node2.y - node1.y;
    const run = node2.x - node1.x;

    // Use Pythagorean theorem to calculate the x and y forces
    const xForce = Math.sqrt((force ** 2) / (1 + (rise / run) ** 2)) * Math.sign(run);
    const yForce = Math.sqrt((force ** 2) / (1 + (run / rise) ** 2)) * Math.sign(rise);

    return [xForce, yForce];
  }

  #calcDamping(force, damping = this.damping) {
    const sign = Math.sign(force);
    const abs = Math.abs(force);
    return Math.max(abs - damping * abs, 0) * sign;
  }

  #canApplyForces(node) {
    return node !== this.#draggedNode;
  }

  autoSize(node) {
    return 100 / (1 + Math.exp(- node.edges.size / 100)) - 40;
  }

  #updateSizes(node1, node2) {
    node1.autoSize && (node1.size = this.autoSize(node1));
    node2?.autoSize && (node2.size = this.autoSize(node2));
  }

  #mouseMove(e) {
    const [x, y] = this.#canvasCoords(e.x, e.y);
    this.#mouseNode = { x, y };

    if (this.#draggedNode !== null) {
      this.#draggedNode.x = x;
      this.#draggedNode.y = y;
      return;
    }
    else if (this.#dragging === true) {
      this.ctx.translate(
        (e.x - this.#startDragX) / this.scale / this.#pageScale,
        (e.y - this.#startDragY) / this.scale / this.#pageScale
      );
      this.#startDragX = e.x;
      this.#startDragY = e.y;

      return;
    }

    this.#hoveredNode = null;
    for (const node of this.#nodes) {
      if (this.dist(node, this.#mouseNode) <= node.size) {
        this.#hoveredNode = node;
        break;
      }
    }
    this.canvas.style.cursor = this.#hoveredNode ? 'pointer' : 'default';
  }

  #mouseDown(e) {
    this.#draggedNode = this.#hoveredNode;
    this.#dragging = true;
    if (!this.#draggedNode) {
      this.canvas.style.cursor = 'grabbing';
    }
    [this.#startDragX, this.#startDragY] = [e.x, e.y];
  }

  #mouseUp() {
    if (!this.#draggedNode) {
      this.canvas.style.cursor = 'default';
    }
    this.#draggedNode = null;
    this.#dragging = false;
  }

  #mouseLeave() {
    this.#draggedNode = null;
    this.#hoveredNode = null;
    this.#dragging = false;
  }

  #zoom(e) {
    e.preventDefault();

    // clear before zooming because otherwise if you're zooming out stuff gets left outside the canvas
    this.#clearCanvas();

    const factor = e.deltaY / -1250;
    const newScale = Math.min(Math.max(Math.round((this.scale + factor) * 10) / 10, 0.1), 5);

    if (newScale === this.scale) {
      return;
    }

    const [x, y] = this.#canvasCoords(e.x, e.y);

    this.ctx.translate(x, y);

    this.ctx.scale(newScale / this.scale, newScale / this.scale);

    this.ctx.translate(-x, -y);

    this.scale = newScale;

    if (this.saveZoom) {
      localStorage.setItem('scale', this.scale);
    }
  }

  #resize() {
    this.width = this.canvas.clientWidth;
    this.height = this.canvas.clientHeight;
    this.centerNode = {
      x: this.width / 2,
      y: this.height / 2,
    };
    this.#pageScale = this.width / this.canvas.width;
  }

  #clearCanvas() {
    // save transforms
    this.ctx.save();
    // reset transforms and clear the whole canvas
    this.ctx.setTransform(1, 0, 0, 1, 0, 0);
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    // restore transforms
    this.ctx.restore();
  }

  /** Set the scale and center the graph in the canvas */
  #setInitialTransform() {
    this.ctx.setTransform(this.scale, 0, 0, this.scale, this.canvas.width / 2, this.canvas.height / 2);

    this.ctx.translate(- this.width / 2, - this.height / 2)
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
  #canvasCoords(x, y) {
    const b = this.canvas.getBoundingClientRect();
    return [
      (((x - b.x) / this.#pageScale) - this.transform.e) / this.scale,
      (((y - b.y) / this.#pageScale) - this.transform.f) / this.scale,
    ];
  }

  /**
   * @param {number} dim 
   * @returns {number}
   */
  #scaledPart(dim) {
    return dim * (1 - this.scale);
  }
}
