import { describe, expect, it } from "vitest";
import { isPhoneLikeViewport, shouldGateForPortrait } from "../src/mobile";

describe("mobile orientation gate", () => {
  it("gates a touch phone held in portrait", () => {
    expect(shouldGateForPortrait({ width: 390, height: 844, coarsePointer: true, touchPoints: 5 })).toBe(true);
  });

  it("allows the same phone in landscape", () => {
    expect(shouldGateForPortrait({ width: 844, height: 390, coarsePointer: true, touchPoints: 5 })).toBe(false);
  });

  it("does not gate narrow desktop windows without touch input", () => {
    expect(shouldGateForPortrait({ width: 390, height: 844, coarsePointer: false, touchPoints: 0 })).toBe(false);
  });

  it("does not treat large touch devices as phone viewports", () => {
    const tablet = { width: 820, height: 1180, coarsePointer: true, touchPoints: 5 };
    expect(isPhoneLikeViewport(tablet)).toBe(false);
    expect(shouldGateForPortrait(tablet)).toBe(false);
  });
});
