# Symbol Explorer

Visualizes symbol-level access coverage of **TypeScript codebases** as an interactive graph.

## Concept

This tool visualizes **symbol access coverage**.

It answers: "Given this symbol, what other symbols are in scope at its location?"

This is different from traditional dependency graphs that show file structure or actual usage.

### What it checks

- **Intra-file edges**: All top-level symbols in the same file can access each other (bidirectional edges)
- **Inter-file edges**: Symbols in importing files can only access exported symbols from imported files
- **Re-exports**: Routed through their defining modules (barrels) so edges point at real symbol locations
- **Type-only imports**: Rendered as dashed edges (erased at runtime)

### What it's useful for

- Understanding the dependency surface of a symbol
- Identifying which imported modules expose what to a given file
- Seeing the full context of what's available within a file's scope

## Usage

```bash
npm install
npm run dev
```

Then open the app and **select a project directory** (uses the browser File System Access API, so a Chromium-based browser is required). The graph is built from the TypeScript (`.ts`/`.tsx`) files in that directory.

## Features

- Loads a local project directory and parses it with the TypeScript compiler
- Multiple graph views: force simulation, circles, boxes, polygon/poly-block layouts, oriented rectangles, and parametric curve modes
- Module and symbol tree sidebar with expand/collapse and hide/show
- Re-export routing through barrel modules; empty modules shown as draggable blocks
- Drag nodes, zoom, and pan; color-coded by folder/module
- Type-only imports shown as dashed edges
- Persists directory handles (IndexedDB) and layout/UI state (localStorage)
