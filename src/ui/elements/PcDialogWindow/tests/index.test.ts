import { describe, it, expect, afterEach } from "vitest";
import "..";
import type { DialogCloseReason, PcDialogWindow } from "..";
import {
  events,
  mount,
  pointerEvent,
  query,
  queryAll,
} from "../../../../testing/elements";

afterEach(() => {
  document.body.replaceChildren();
  document.documentElement.style.overflow = "";
});

/** A dialog window with content in each slot */
const CONTENT = `
  <span slot="header-start">Start</span>
  <h2 slot="header-middle">Title</h2>
  <span slot="header-end">End</span>
  <p slot="body">Body</p>
  <span slot="footer-start">Left</span>
  <span slot="footer-middle">Centre</span>
  <button slot="footer-end">Done</button>
`;

/** The `<dialog>` a window is built on */
const dialogOf = (element: PcDialogWindow) =>
  query<HTMLDialogElement>(element, "dialog");

/** Let the dialog's `close` event (fired after closing) arrive */
const settle = () => new Promise((resolve) => setTimeout(resolve));

describe("pc-dialog-window", () => {
  it("should be closed, closable and dismissible, not shaded or inline, by default", async () => {
    const element = await mount<PcDialogWindow>("pc-dialog-window");
    expect([
      element.open,
      element.closable,
      element.dismissible,
      element.shaded,
      element.inline,
    ]).toEqual([false, true, true, false, false]);
    expect(dialogOf(element).open).toBe(false);
  });

  it("should put content in its slots, named by its header's middle for screen readers", async () => {
    const element = await mount<PcDialogWindow>(
      "pc-dialog-window",
      { open: true },
      CONTENT,
    );
    const dialog = dialogOf(element);
    expect(dialog.getAttribute("aria-labelledby")).toBe("title");
    expect(query(element, "#title").className).toBe("middle");
    const slotted = (name: string) =>
      query<HTMLSlotElement>(element, `slot[name="${name}"]`)
        .assignedElements()
        .map((node) => node.textContent);
    expect(slotted("header-start")).toEqual(["Start"]);
    expect(slotted("header-middle")).toEqual(["Title"]);
    expect(slotted("header-end")).toEqual(["End"]);
    expect(slotted("body")).toEqual(["Body"]);
    expect(slotted("footer-start")).toEqual(["Left"]);
    expect(slotted("footer-middle")).toEqual(["Centre"]);
    expect(slotted("footer-end")).toEqual(["Done"]);
    expect(query(element, "header").hidden).toBe(false);
    expect(query(element, "footer").hidden).toBe(false);

    // A label names it instead
    element.label = "Settings";
    await element.updateComplete;
    expect(dialog.getAttribute("aria-label")).toBe("Settings");
    expect(dialog.hasAttribute("aria-labelledby")).toBe(false);
    expect(dialog.hasAttribute("aria-description")).toBe(false);
    element.description = "Change the keys";
    await element.updateComplete;
    expect(dialog.getAttribute("aria-description")).toBe("Change the keys");
  });

  it("should show its header and footer only with content (or the ⨉ button)", async () => {
    const element = await mount<PcDialogWindow>(
      "pc-dialog-window",
      { open: true, closable: false },
      "<p>Only a body, without a slot</p>",
    );
    expect(query(element, "header").hidden).toBe(true);
    expect(query(element, "footer").hidden).toBe(true);
    expect(
      query<HTMLSlotElement>(element, ".body slot:not([name])")
        .assignedNodes()
        .map((node) => node.textContent),
    ).toEqual(["Only a body, without a slot"]);
    // The ⨉ button shows the header, with only its end
    element.closable = true;
    await element.updateComplete;
    expect(query(element, "header").hidden).toBe(false);
    expect(
      queryAll(element, "header > div").map((region) => region.hidden),
    ).toEqual([true, true, false]);
    // Content added later shows the footer
    const footer = document.createElement("span");
    footer.slot = "footer-end";
    element.append(footer);
    await new Promise((resolve) => setTimeout(resolve));
    await element.updateComplete;
    expect(query(element, "footer").hidden).toBe(false);
    expect(
      queryAll(element, "footer > div").map((region) => region.hidden),
    ).toEqual([true, true, false]);
  });

  it("should open as a modal window and keep the page from scrolling until it closes", async () => {
    document.documentElement.style.overflow = "auto";
    const element = await mount<PcDialogWindow>("pc-dialog-window");
    const dialog = dialogOf(element);
    element.open = true;
    await element.updateComplete;
    expect(dialog.open).toBe(true);
    expect(document.documentElement.style.overflow).toBe("hidden");
    // Two windows: the page scrolls again once both have closed
    const other = await mount<PcDialogWindow>("pc-dialog-window", {
      open: true,
    });
    element.open = false;
    await element.updateComplete;
    expect(dialog.open).toBe(false);
    expect(document.documentElement.style.overflow).toBe("hidden");
    other.remove();
    expect(document.documentElement.style.overflow).toBe("auto");
    // Its close event, once closed, changes nothing
    await settle();
    expect(element.open).toBe(false);
  });

  it("should cover only its positioned ancestor while inline, leaving the page scrolling", async () => {
    const element = await mount<PcDialogWindow>("pc-dialog-window", {
      open: true,
      inline: true,
    });
    const dialog = dialogOf(element);
    expect(dialog.open).toBe(true);
    expect(document.documentElement.style.overflow).toBe("");
    // Made modal while open: shown again as modal
    element.inline = false;
    await element.updateComplete;
    await settle();
    expect([element.open, dialog.open]).toEqual([true, true]);
    expect(document.documentElement.style.overflow).toBe("hidden");
  });

  it("should close when asked with ⨉, Escape or a press outside, unless the request is cancelled", async () => {
    const element = await mount<PcDialogWindow>(
      "pc-dialog-window",
      { open: true },
      CONTENT,
    );
    const requests = events<{ reason: DialogCloseReason }>(
      element,
      "pc-dismiss",
    );
    const dialog = dialogOf(element);
    const reopen = async () => {
      element.open = true;
      await element.updateComplete;
    };

    query<HTMLButtonElement>(element, "button.close").click();
    expect(element.open).toBe(false);
    await reopen();

    dialog.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape", cancelable: true }),
    );
    expect(element.open).toBe(false);
    await reopen();

    // Other keys do nothing, nor Escape that something in it used
    dialog.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter" }));
    const used = new KeyboardEvent("keydown", {
      key: "Escape",
      cancelable: true,
    });
    used.preventDefault();
    dialog.dispatchEvent(used);
    expect(element.open).toBe(true);

    // The browser's own request (e.g. a back gesture) is handled as Escape
    const cancel = new Event("cancel", { cancelable: true });
    dialog.dispatchEvent(cancel);
    expect(cancel.defaultPrevented).toBe(true);
    expect(element.open).toBe(false);
    await reopen();

    // A press on the backdrop is a press on the dialog itself
    dialog.dispatchEvent(pointerEvent("pointerdown", 0, 0));
    dialog.dispatchEvent(pointerEvent("click", 0, 0));
    expect(element.open).toBe(false);
    await reopen();

    expect(requests.map(({ reason }) => reason)).toEqual([
      "close",
      "escape",
      "escape",
      "outside",
    ]);

    // Presses inside the window, or that start inside it and end outside (e.g. selecting text), don't close it
    const window = query(element, ".window");
    window.dispatchEvent(pointerEvent("pointerdown", 0, 0));
    window.dispatchEvent(pointerEvent("click", 0, 0));
    window.dispatchEvent(pointerEvent("pointerdown", 0, 0));
    dialog.dispatchEvent(pointerEvent("click", 0, 0));
    expect(element.open).toBe(true);

    // Cancelling the request keeps it open
    element.addEventListener("pc-dismiss", (event) => event.preventDefault());
    element.requestClose("close");
    expect(element.open).toBe(true);
  });

  it("should not close with a press outside unless dismissible, nor with Escape unless closable or dismissible", async () => {
    const element = await mount<PcDialogWindow>("pc-dialog-window", {
      open: true,
      dismissible: false,
    });
    const dialog = dialogOf(element);
    dialog.dispatchEvent(pointerEvent("pointerdown", 0, 0));
    dialog.dispatchEvent(pointerEvent("click", 0, 0));
    expect(element.open).toBe(true);
    // Escape still closes it with the ⨉ button there
    dialog.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    expect(element.open).toBe(false);

    element.closable = false;
    element.open = true;
    await element.updateComplete;
    expect(queryAll(element, "button.close")).toHaveLength(0);
    const escape = new KeyboardEvent("keydown", {
      key: "Escape",
      cancelable: true,
    });
    dialog.dispatchEvent(escape);
    expect(escape.defaultPrevented).toBe(true);
    dialog.dispatchEvent(new Event("cancel", { cancelable: true }));
    expect(element.open).toBe(true);
  });

  it('should read closable and dismissible as on unless they\'re "false"', async () => {
    document.body.innerHTML =
      '<pc-dialog-window closable="false" dismissible="false" shaded></pc-dialog-window>';
    const element = document.querySelector(
      "pc-dialog-window",
    ) as PcDialogWindow;
    await element.updateComplete;
    expect([element.closable, element.dismissible, element.shaded]).toEqual([
      false,
      false,
      true,
    ]);
    element.setAttribute("closable", "");
    element.removeAttribute("dismissible");
    expect([element.closable, element.dismissible]).toEqual([true, false]);
    element.dismissible = true;
    await element.updateComplete;
    expect(element.getAttribute("dismissible")).toBe("");
    element.closable = false;
    await element.updateComplete;
    expect(element.getAttribute("closable")).toBe("false");
  });

  it("should give focus back to what had it before it opened when taken out of the page while open", async () => {
    // A button in a shadow root, as in another element
    const host = document.createElement("div");
    const button = document.createElement("button");
    host.attachShadow({ mode: "open" }).append(button);
    document.body.append(host);
    button.focus();
    const element = await mount<PcDialogWindow>("pc-dialog-window", {
      open: true,
    });
    query<HTMLButtonElement>(element, "button.close").focus();
    element.remove();
    expect(host.shadowRoot!.activeElement).toBe(button);
    // Not when what had focus has gone too
    document.body.append(element);
    await element.updateComplete;
    const other = document.createElement("input");
    document.body.append(other);
    host.remove();
    element.remove();
    expect(document.activeElement).not.toBe(host);
  });

  it("should follow being closed some other way, and show again when put back in the page", async () => {
    const element = await mount<PcDialogWindow>("pc-dialog-window", {
      open: true,
    });
    const dialog = dialogOf(element);
    dialog.close();
    await settle();
    expect(element.open).toBe(false);

    element.open = true;
    await element.updateComplete;
    // Taken out of the page: closed, so focus goes back, but still open to show again
    element.remove();
    expect(dialog.open).toBe(false);
    expect(document.documentElement.style.overflow).toBe("");
    await settle();
    expect(element.open).toBe(true);
    document.body.append(element);
    expect(dialog.open).toBe(true);
    expect(document.documentElement.style.overflow).toBe("hidden");
    await settle();
    expect(element.open).toBe(true);
    // Put back while closed: stays closed
    element.open = false;
    await element.updateComplete;
    element.remove();
    document.body.append(element);
    expect(dialog.open).toBe(false);
  });
});
