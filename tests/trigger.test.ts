import { describe, expect, it } from "vitest";
import { isModifierKey, modifierHeld, movedBeyond } from "../src/hover/trigger";

const none = { metaKey: false, ctrlKey: false, altKey: false, shiftKey: false };

describe("movedBeyond", () => {
	it("treats the first position as a move", () => {
		expect(movedBeyond(null, { x: 0, y: 0 })).toBe(true);
	});

	it("ignores hand jitter but catches a sweep", () => {
		const from = { x: 100, y: 100 };
		expect(movedBeyond(from, { x: 102, y: 103 })).toBe(false);
		expect(movedBeyond(from, { x: 104, y: 100 })).toBe(false);
		expect(movedBeyond(from, { x: 105, y: 100 })).toBe(true);
		expect(movedBeyond(from, { x: 100, y: 95 })).toBe(true);
	});
});

describe("modifierHeld", () => {
	it("always passes with no trigger key", () => {
		expect(modifierHeld(none, "none", true)).toBe(true);
	});

	it("maps Mod to Cmd on macOS and Ctrl elsewhere", () => {
		expect(modifierHeld({ ...none, metaKey: true }, "Mod", true)).toBe(true);
		expect(modifierHeld({ ...none, ctrlKey: true }, "Mod", true)).toBe(false);
		expect(modifierHeld({ ...none, ctrlKey: true }, "Mod", false)).toBe(true);
		expect(modifierHeld({ ...none, metaKey: true }, "Mod", false)).toBe(false);
	});

	it("checks Alt and Shift directly", () => {
		expect(modifierHeld({ ...none, altKey: true }, "Alt", true)).toBe(true);
		expect(modifierHeld({ ...none, shiftKey: true }, "Alt", true)).toBe(false);
		expect(modifierHeld({ ...none, shiftKey: true }, "Shift", false)).toBe(true);
	});
});

describe("isModifierKey", () => {
	it("recognises the trigger key's own keydown", () => {
		expect(isModifierKey("Meta", "Mod", true)).toBe(true);
		expect(isModifierKey("Control", "Mod", true)).toBe(false);
		expect(isModifierKey("Control", "Mod", false)).toBe(true);
		expect(isModifierKey("Alt", "Alt", true)).toBe(true);
		expect(isModifierKey("Shift", "Shift", true)).toBe(true);
		expect(isModifierKey("Shift", "none", true)).toBe(false);
		expect(isModifierKey("a", "Shift", true)).toBe(false);
	});
});
