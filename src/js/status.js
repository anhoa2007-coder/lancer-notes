// ========================================
// STATUS.JS - Status bar, word count, line count
// Feature module — depends only on core
// ========================================

function updateStatusBar() {
    const text = editor.value;
    const wordCount = text.trim() ? text.trim().split(/\s+/).length : 0;
    const charCount = text.length;
    const lineCount = text.split("\n").length;

    document.getElementById("word-count").textContent = `Words: ${wordCount}`;
    document.getElementById("char-count").textContent = `Characters: ${charCount}`;
    document.getElementById("line-count").textContent = `Lines: ${lineCount}`;
}

function updateStatus(message) {
    document.getElementById("status-left").textContent = message;
    setTimeout(() => {
        document.getElementById("status-left").textContent = "Ready";
    }, 3000);
}

// Expose
window.updateStatusBar = updateStatusBar;
window.updateStatus = updateStatus;

console.log("✓ status.js loaded");