/**
 * Vitest global setup
 * This runs once before the test process starts
 * Used to register native modules that need global setup
 */

// Register the canvas package for jsdom
// The canvas package provides Node.js implementations of HTML Canvas APIs
// It must be required/imported before any tests use canvas functionality
import { createCanvas } from "canvas";

// Create a dummy canvas to trigger registration
// This ensures HTMLCanvasElement.getContext("2d") works in jsdom
createCanvas(1, 1);

export default null;
