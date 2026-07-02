# Symbol Explorer

Visualizes symbol-level access coverage as an interactive graph.

## Concept

This tool visualizes **symbol access coverage**.

It answers: "Given this symbol, what other symbols are in scope at its location?"

This is different from traditional dependency graphs that show file structure or actual usage.

### What it checks

- **Intra-file edges**: All top-level symbols in the same file can access each other (bidirectional edges)
- **Inter-file edges**: Symbols in importing files can only access exported symbols from imported files
- **Re-exports**: Skipped in favor of showing actual symbol locations

### What it's useful for

- Understanding the dependency surface of a symbol
- Identifying which imported modules expose what to a given file
- Seeing the full context of what's available within a file's scope

## Usage

```bash
npm install
npm run dev
```

## Features

- Interactive dependency graph using D3.js force simulation
- Visualizes symbol-level access relationships
- Drag nodes, zoom, and pan the graph
- Color-coded by folder/module
- Hover labels show symbol name and file path
