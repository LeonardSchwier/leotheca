/**
 * Platform detection utilities.
 *
 * Uses Capacitor when available (native Android/iOS), falls back to
 * browser detection otherwise.
 */

import { Capacitor } from "@capacitor/core";

let _cachedIsAndroid: boolean | null = null;

export function isAndroid(): boolean {
  if (_cachedIsAndroid !== null) return _cachedIsAndroid;

  // Capacitor is the authoritative signal on native platforms.
  if (Capacitor.isNativePlatform() && Capacitor.getPlatform() === "android") {
    _cachedIsAndroid = true;
    return true;
  }

  // Fallback: user-agent sniffing (covers web + native WebView).
  const ua = typeof navigator !== "undefined" ? navigator.userAgent : "";
  _cachedIsAndroid = /Android/i.test(ua);
  return _cachedIsAndroid!;
}

export function isIOS(): boolean {
  if (Capacitor.isNativePlatform() && Capacitor.getPlatform() === "ios") {
    return true;
  }
  const ua = typeof navigator !== "undefined" ? navigator.userAgent : "";
  return /iPhone|iPad|iPod/i.test(ua);
}

export function isMobile(): boolean {
  return isAndroid() || isIOS();
}
