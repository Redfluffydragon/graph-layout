# Graph Layout

This is a force-directed layout library that is quite unfinished right now.

## How to use

### Create a new graph
The library exports a single ES6 Graph class.

```js
import Graph from 'graph-layout';
```

To create a new graph, all that's required is a canvas element or the ID for a canvas element.

```js
// With canvas id
const graph = new Graph('myCanvas');

// Or with canvas element
const canvas = document.querySelector('canvas');
const graph = new Graph(canvas);
```

### Options
There are a variety of options you can set when creating a new graph.

TODO tabulate options

### Adding nodes
To add nodes, use the newNode method
```js
const node1 = graph.newNode();
```
with options:
```js
const node2 = graph.newNode({
  label: 'Node 2',
  onclick: () => {
    alert('You clicked node 2');
  },
  autoSize: true,
  color: 'red',
})
```

To add edges, use the newEdge method

```js
graph.newEdge(node1, node2);
```
currently, if you want to add edges, you either have to keep a reference to the nodes you want to add edges between, or be able to find them by label.

### Running the graph

To start the graph, call `graph.render()`.
\
To stop the graph, call `graph.stop()`.
