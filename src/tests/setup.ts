// jsdom can't draw: without the `canvas` package, its canvases have no 2D context, and it warns "Not implemented" each
// time one is asked for. Answer the same (no context) without the warning; tests that draw replace `getContext`. Test
// files that run in Node instead of jsdom have no canvases.
if (typeof HTMLCanvasElement !== "undefined")
  HTMLCanvasElement.prototype.getContext = (() =>
    null) as unknown as HTMLCanvasElement["getContext"];

// jsdom has no dialog methods: showing a dialog sets `open`, and closing one removes it and then fires `close`, as
// browsers do (they fire it in a later task)
if (typeof HTMLDialogElement !== "undefined") {
  HTMLDialogElement.prototype.show = function (this: HTMLDialogElement) {
    this.setAttribute("open", "");
  };
  HTMLDialogElement.prototype.showModal = HTMLDialogElement.prototype.show;
  HTMLDialogElement.prototype.close = function (this: HTMLDialogElement) {
    if (!this.open) return;
    this.removeAttribute("open");
    queueMicrotask(() => this.dispatchEvent(new Event("close")));
  };
}
