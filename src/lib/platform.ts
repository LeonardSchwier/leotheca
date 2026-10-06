/**
 * Platform detection utilities.
 *
 * Uses Capacitor when available (native Android/iOS), falls back to
 * browser detection otherwise.
 */

import { Capacitor } from "@capacitor/core";

let _cachedIsAndroid: boolean | null = null;
let _cachedIsIOS: boolean | null = null;

function cachedIsAndroid(): boolean {
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

function cachedIsIOS(): boolean {
  if (_cachedIsIOS !== null) return _cachedIsIOS;

  if (Capacitor.isNativePlatform() && Capacitor.getPlatform() === "ios") {
    _cachedIsIOS = true;
    return true;
  }

  const ua = typeof navigator !== "undefined" ? navigator.userAgent : "";
  _cachedIsIOS = /iPhone|iPad|iPod/i.test(ua);
  return _cachedIsIOS!;
}

export function isAndroid(): boolean {
  return cachedIsAndroid();
}

export function isIOS(): boolean {
  return cachedIsIOS();
}

export function isMobile(): boolean {
  return cachedIsAndroid() || cachedIsIOS();
}
