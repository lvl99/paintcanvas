// PaintCanvas optional UI: design tokens, icons, base elements, drawing elements and the `<paint-canvas>` layout.
// Importing this registers every element; import single elements (e.g. `@lvl99dotcom/paintcanvas/ui/elements/PcButton`) to load less.
export {
  tokens,
  installTokens,
  TOKENS_CSS,
  LIGHT_TOKENS,
  DARK_TOKENS,
} from "./tokens";
export { icons, IconRegistry, DEFAULT_ICONS, type IconName } from "./icons";
export { PcElement, defineElement, emit } from "./base";
export { PcIcon } from "./elements/PcIcon";
export { PcButton, type ButtonVariant } from "./elements/PcButton";
export { PcButtonGroup } from "./elements/PcButtonGroup";
export { PcIconToggle } from "./elements/PcIconToggle";
export { PcToggleCheckbox } from "./elements/PcToggleCheckbox";
export { PcSlider } from "./elements/PcSlider";
export { PcNumberSlider, fitNumber } from "./elements/PcNumberSlider";
export {
  PcProfileEditor,
  type ProfileSaveDetail,
} from "./elements/PcProfileEditor";
export {
  PcProfileGraph,
  curvePath,
  movePoint,
} from "./elements/PcProfileGraph";
export {
  PcSliderRange,
  rangeFraction,
  type RangeDetail,
  type RangeEnd,
} from "./elements/PcSliderRange";
export { PcBrushSize, sizeText } from "./elements/PcBrushSize";
export { PointerDrag, DRAG_THRESHOLD, dragDelta } from "./drag";
export { markDismissingPress, isDismissingPress } from "./dismiss";
export {
  PcMenu,
  isMenuItem,
  menuSections,
  type MenuItem,
  type MenuLabel,
  type MenuDivider,
  type MenuEntry,
} from "./elements/PcMenu";
export {
  PcContextMenu,
  CONTEXT_MENU_TOGGLE_EVENT,
  MENU_MARGIN,
  menuLeft,
  menuTop,
  type MenuPlacement,
} from "./elements/PcContextMenu";
export {
  PcDialogWindow,
  DIALOG_DISMISS_EVENT,
  type DialogCloseReason,
} from "./elements/PcDialogWindow";
export {
  PcDialog,
  CANCEL_CHOICE,
  type DialogChoice,
  type DialogChoiceDetail,
  type DialogField,
} from "./elements/PcDialog";
export {
  askConfirm,
  askText,
  deletePresetQuestion,
  OK_CHOICE,
  type AskOptions,
  type AskTextOptions,
  type ConfirmFn,
  type PromptFn,
} from "./ask";
export { PcToast, TOAST_DURATION_MS, type ToastKind } from "./elements/PcToast";
export { PcInfoTip } from "./elements/PcInfoTip";
export { PcPopover } from "./elements/PcPopover";
export { PcPanel } from "./elements/PcPanel";
export {
  PcPane,
  PANE_COLLAPSE_EVENT,
  type PaneEdge,
  type PaneOrientation,
} from "./elements/PcPane";
export {
  PcInputSettings,
  type InputSettingsLike,
} from "./elements/PcInputSettings";
export { PcMatch } from "./elements/PcMatch";
export { PcColourPair, COLOUR_CLICK_EVENT } from "./elements/PcColourPair";
export { PcClipboardTools, CLIPBOARD_TOOLS } from "./elements/PcClipboardTools";
export {
  PcShortcutSettings,
  type ShortcutSettingsLike,
} from "./elements/PcShortcutSettings";
export { PcAppSettings } from "./elements/PcAppSettings";
export {
  PcPanelColours,
  LONG_PRESS_MS,
  type ColourModel,
} from "./elements/PcPanelColours";
export { PcStats, formatBytes } from "./elements/PcStats";
export {
  PcThemePicker,
  THEMES,
  THEME_ICONS,
  isTheme,
  type Theme,
} from "./elements/PcThemePicker";
export { PaintCanvasElement } from "./elements/PaintCanvas";
export {
  DEFAULT_NARROW_WIDTH,
  DEFAULT_SIDE_MODES,
  LayoutStateController,
  STATE_EVENT,
  matchesState,
  parseSideModes,
  showsRail,
  sideModeFor,
  type InputKind,
  type LayoutState,
  type SideMode,
  type SideModeRule,
} from "./layout";
