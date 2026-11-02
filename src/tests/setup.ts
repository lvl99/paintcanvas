// jsdom can't draw: without the `canvas` package, its canvases have no 2D context, and it warns "Not implemented" each
// time one is asked for. Answer the same (no context) without the warning; tests that draw replace `getContext`. Test
// files that run in Node instead of jsdom have no canvases.
if (typeof HTMLCanvasElement !== "undefined")
  HTMLCanvasElement.prototype.getContext = (() =>
    null) as unknown as HTMLCanvasElement["getContext"];
