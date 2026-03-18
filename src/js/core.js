// ========================================
// CORE.JS - Globals, state, init, undo/redo
// Core layer — always loaded first, no cross-dependencies
// Build 6419
// ========================================

let editor;
let preview;
let currentFile = null;
let currentFileHandle = null;
let undoStack = [];
let redoStack = [];
let currentViewMode = "split";
let findState = {};

const BUILD_NUMBER = 6419;

// Basic undo/redo (called by every formatting function)
function saveToUndoStack() {
    if (!editor) return;
    undoStack.push(editor.value);
    if (undoStack.length > 50) undoStack.shift();
    redoStack = [];
}

// Core initialization
function initCore() {
    editor = document.getElementById("editor");
    preview = document.getElementById("preview");

    if (editor) {
        undoStack = [editor.value || ""];
        editor.addEventListener("input", () => {
            saveToUndoStack();
        });
    }

    console.log("✓ core.js loaded — globals & state ready");
    window.MAIN_CORE_LOADED = true;
}

// Expose everything the rest of the app needs
window.editor = () => editor;
window.preview = () => preview;
window.undoStack = () => undoStack;
window.redoStack = () => redoStack;
window.currentFile = () => currentFile;
window.currentViewMode = () => currentViewMode;
window.BUILD_NUMBER = BUILD_NUMBER;
window.saveToUndoStack = saveToUndoStack;
window.initCore = initCore;

// Auto-init on DOM ready
document.addEventListener("DOMContentLoaded", initCore);