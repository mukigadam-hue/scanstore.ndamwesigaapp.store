import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { prefetchInterstitial, showInterstitial } from "@/lib/ads";

describe("native interstitial checkpoints", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    localStorage.clear();
    vi.unstubAllGlobals();
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("skips the empty web ad surface without recording a cooldown", async () => {
    await showInterstitial("last-verify", 120_000);
    expect(localStorage.getItem("ad_cooldown_last-verify")).toBeNull();
  });

  it("preloads silently and shows once at final verification", async () => {
    const preloadInterstitial = vi.fn();
    const showNative = vi.fn();
    vi.stubGlobal("Android", { preloadInterstitial, showInterstitial: showNative });

    prefetchInterstitial();
    expect(preloadInterstitial).toHaveBeenCalledOnce();
    expect(showNative).not.toHaveBeenCalled();

    await showInterstitial("last-verify", 120_000);
    expect(showNative).toHaveBeenCalledOnce();
    await showInterstitial("last-verify", 120_000);
    expect(showNative).toHaveBeenCalledOnce();
  });

  it("does not show ads for unrelated actions", async () => {
    const showNative = vi.fn();
    vi.stubGlobal("Android", { showInterstitial: showNative });
    await showInterstitial("sign-out", 120_000);
    expect(showNative).not.toHaveBeenCalled();
  });
});