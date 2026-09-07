/**
 * Vitest setup file
 * Configures the canvas package for tests that use HTML Canvas API
 */

// Import canvas to register it with jsdom
// This is needed for tests that use getContext("2d") and other canvas APIs
import { createCanvas } from "canvas";

// Create a dummy canvas to ensure the package is loaded
// This registers the canvas APIs globally
createCanvas(1, 1);

// Note: The canvas package automatically installs its implementations
// on the global HTMLCanvasElement, CanvasRenderingContext2D, etc.
// This allows jsdom-based tests to use canvas APIs without additional mocking.
