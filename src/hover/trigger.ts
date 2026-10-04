import type { TriggerModifier } from "../settings";

/**
 * Pure trigger rules, kept free of Obsidian imports so they run under node tests.
 */

/** Pointer drift below this is treated as a resting hand, not a move. */
export const STILLNESS_THRESHOLD_PX = 4;

export interface Point {
	x: number;
	y: number;
}

export function movedBeyond(from: Point | null, to: Point, threshold: number = STILLNESS_THRESHOLD_PX): boolean {
	if (!from) return true;
	const dx = to.x - from.x;
	const dy = to.y - from.y;
	return dx * dx + dy * dy > threshold * threshold;
}

export interface ModifierState {
	metaKey: boolean;
	ctrlKey: boolean;
	altKey: boolean;
	shiftKey: boolean;
}

/** Whether the configured trigger key is held during a pointer or keyboard event. */
export function modifierHeld(event: ModifierState, modifier: TriggerModifier, isMac: boolean): boolean {
	switch (modifier) {
		case "none":
			return true;
		case "Mod":
			return isMac ? event.metaKey : event.ctrlKey;
		case "Alt":
			return event.altKey;
		case "Shift":
			return event.shiftKey;
	}
}

/** Whether a `keydown` is the trigger key itself (so pressing it over a link opens the card). */
export function isModifierKey(key: string, modifier: TriggerModifier, isMac: boolean): boolean {
	switch (modifier) {
		case "none":
			return false;
		case "Mod":
			return key === (isMac ? "Meta" : "Control");
		case "Alt":
			return key === "Alt";
		case "Shift":
			return key === "Shift";
	}
}
