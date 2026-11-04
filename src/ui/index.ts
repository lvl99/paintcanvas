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
export { PcContextMenu, type MenuItem } from "./elements/PcContextMenu";
export {
  PcDialog,
  CANCEL_CHOICE,
  type DialogChoice,
} from "./elements/PcDialog";
export { PcToast, TOAST_DURATION_MS, type ToastKind } from "./elements/PcToast";
export { PcInfoTip } from "./elements/PcInfoTip";
export { PcPopover } from "./elements/PcPopover";
export { PcPanel } from "./elements/PcPanel";
export {
  PcInputSettings,
  type InputSettingsLike,
} from "./elements/PcInputSettings";
export { PcMatch } from "./elements/PcMatch";
export { PcColourPair, COLOUR_CLICK_EVENT } from "./elements/PcColourPair";
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
  sideModeFor,
  type InputKind,
  type LayoutState,
  type SideMode,
  type SideModeRule,
} from "./layout";
