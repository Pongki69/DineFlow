// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { playSound, setSoundsEnabled, soundsEnabled } from "./uiSound";

afterEach(() => {
  localStorage.clear();
  vi.unstubAllGlobals();
});

describe("interface sounds", () => {
  it("are on by default and remember being turned off", () => {
    expect(soundsEnabled()).toBe(true);
    setSoundsEnabled(false);
    expect(soundsEnabled()).toBe(false);
    setSoundsEnabled(true);
    expect(soundsEnabled()).toBe(true);
  });

  it("never throw, even without Web Audio", () => {
    vi.stubGlobal("AudioContext", undefined);
    expect(() => playSound("add")).not.toThrow();
    vi.stubGlobal("AudioContext", function Broken() {
      throw new Error("blocked");
    });
    expect(() => playSound("success")).not.toThrow();
  });

  it("stay silent when turned off", () => {
    const Audio = vi.fn();
    vi.stubGlobal("AudioContext", Audio);
    setSoundsEnabled(false);
    playSound("add");
    expect(Audio).not.toHaveBeenCalled();
  });
});
