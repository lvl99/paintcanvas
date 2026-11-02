---
sidebar_position: 4
---

# Messages and events

PaintCanvas doesn't decide where drawings go. It sends messages; you carry them.

```ts
// Send: patches of the user's drawing shortly after it changes, plus each stroke if asked
const stop = canvas.onMessage((message) => transport.send(message));
canvas.startSending({ patches: true, strokes: false, delayMs: 200 });

// Receive: draw another source's messages onto their own sheet, under or over the user's layers
transport.onMessage((from, message) => canvas.receive(from, message));
```

| Message  | Holds                                                    |
| -------- | -------------------------------------------------------- |
| `patch`  | A changed area of pixels (PNG or RGBA, deflated, base64) |
| `stroke` | A finished brush or eraser stroke: its points and brush  |
| `undo`   | A step undone                                            |
| `redo`   | A step redone                                            |

Every message has a `protocol` version and a `type`. `receive` checks messages first and ignores invalid ones; `validateCanvasMessage` (`paintcanvas/lib/messages`) checks them yourself.

Other useful methods:

- `canvas.snapshot()`: a patch of the user's whole drawing, e.g. for someone who joins late.
- `canvas.sendNow()`: send what changed straight away.
- `canvas.external`: the sheets drawn from other sources; `clear()` removes them.
- The `history` event: an undo or redo message was received.
