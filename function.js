// ========================================
// MARKDOWN EDITOR - CORE FUNCTIONS
// function.js
// Build 6372
// ========================================
// This file contains all core markdown processing,
// formatting, and utility functions for the editor.
// Note: Global variables (editor, preview, currentFile, undoStack, redoStack, currentViewMode, BUILD_NUMBER, findState)
// are defined in the HTML file and referenced here.
// ========================================

// Custom code starts below
/**
 * Parse markdown text to HTML using markdown-it
 * @param {string} markdown - The markdown text to parse
 * @returns {string} - The parsed HTML
 */
function parseMarkdown(markdown) {
  if (typeof markdownit === "undefined")
    return '<div class="error">Error: Markdown parser not loaded.</div>';
  try {
    // Initialize markdown-it if not already done
    if (!window.md) {
      window.md = window.markdownit({
        html: true,
        linkify: true,
        typographer: true,
        breaks: true,
      });

      // Configure linkify to handle phone numbers starting with +
      // Simple validation: accepts +, spaces, hyphens, and digits
      window.md.linkify.add("+", {
        validate: function (text, pos, self) {
          var tail = text.slice(pos);
          var re = /^[\d\-\s]+/;
          if (re.test(tail)) {
            var match = tail.match(re)[0];
            // Ensure it has at least 5 digits to be considered a phone number
            if (match.replace(/[^\d]/g, "").length >= 5) {
              return match.length;
            }
          }
          return 0;
        },
        normalize: function (match) {
          match.url = "tel:" + match.url.replace(/\s+/g, "");
        },
      });

      // Disable indented code blocks (4 spaces)
      // This prevents accidental code blocks when aligning text
      window.md.disable("code");

      // CUSTOM RENDERER: Inject source line numbers into headers
      // This is crucial for accurate scroll sync
      const defaultRender =
        window.md.renderer.rules.heading_open ||
        function (tokens, idx, options, env, self) {
          return self.renderToken(tokens, idx, options);
        };

      window.md.renderer.rules.heading_open = function (
        tokens,
        idx,
        options,
        env,
        self,
      ) {
        const token = tokens[idx];
        if (token.map && token.level === 0) {
          // Top-level relative to current block, not header level (h1/h2)
          // token.map[0] is the start line (0-indexed)
          token.attrSet("data-source-line", token.map[0]);
        }
        return defaultRender(tokens, idx, options, env, self);
      };
    }

    const rawHtml = window.md.render(markdown);

    // Sanitize if DOMPurify is available
    if (typeof DOMPurify !== "undefined") {
      return DOMPurify.sanitize(rawHtml, {
        // Allow specific tags and attributes if needed, but default is usually safe
        ADD_TAGS: ["iframe"], // Example if we want to support embeds
        ADD_ATTR: ["target", "data-source-line"], // Allow our custom sync attribute
        ADD_URI_SCHEMES: ["tel", "mailto"], // Ensure tel and mailto are allowed
      });
    }
    return rawHtml;
  } catch (e) {
    console.error("Markdown parsing error:", e);
    return markdown;
  }
}
// UI UPDATE FUNCTIONS
// ========================================

/**
 * Update the preview pane with parsed markdown
 */
function updatePreview() {
  const markdownText = editor.value;
  let htmlContent = "";

  // Check file extension for special handling
  if (
    currentFile &&
    (currentFile.endsWith(".ini") || currentFile.endsWith(".log"))
  ) {
    // Render as code block
    const lang = currentFile.endsWith(".ini") ? "ini" : "text"; // 'text' or 'log' if you have a log definition
    // We can use markdown-it to render a code block
    const codeBlock = "```" + lang + "\n" + markdownText + "\n```";
    htmlContent = parseMarkdown(codeBlock);
  } else {
    htmlContent = parseMarkdown(markdownText);
  }

  if (typeof morphdom === "function") {
    // Build new DOM in a detached element
    const tempDiv = document.createElement("div");
    tempDiv.innerHTML = htmlContent;
    // Pre-highlight code blocks so morphdom can diff highlighted trees accurately;
    // unchanged code blocks will match exactly and be skipped entirely
    highlightCodeBlocks(tempDiv);
    // Surgically patch only the differences into the live preview
    morphdom(preview, tempDiv, { childrenOnly: true });
  } else {
    // Fallback: full replacement if morphdom is unavailable
    preview.innerHTML = htmlContent;
    highlightCodeBlocks(preview);
  }
}

// ========================================
// HIGHLIGHT.JS SYNTAX HIGHLIGHTING
// ========================================

/**
 * Highlight all code blocks in the given container using highlight.js
 * @param {HTMLElement} container - The container to search for code blocks
 */
function highlightCodeBlocks(container) {
  if (typeof hljs === "undefined") return;

  const codeBlocks = container.querySelectorAll("pre > code");
  for (const codeEl of codeBlocks) {
    // Skip if already highlighted by highlight.js
    if (codeEl.classList.contains("hljs")) continue;

    hljs.highlightElement(codeEl);
  }
}

/**
 * Update the status bar with current document stats
 */
function updateStatusBar() {
  const text = editor.value;
  const wordCount = text.trim() ? text.trim().split(/\s+/).length : 0;
  const charCount = text.length;
  const lineCount = text.split("\n").length;

  document.getElementById("word-count").textContent = `Words: ${wordCount}`;
  document.getElementById("char-count").textContent =
    `Characters: ${charCount}`;
  document.getElementById("line-count").textContent = `Lines: ${lineCount}`;
}

/**
 * Update status bar message (temporary)
 * @param {string} message - Message to display
 */
function updateStatus(message) {
  document.getElementById("status-left").textContent = message;
  setTimeout(() => {
    document.getElementById("status-left").textContent = "Ready";
  }, 3000);
}

// ========================================
// MARKDOWN FORMATTING
// ========================================

/**
 * Insert markdown formatting around selected text
 * @param {string} before - Text to insert before selection
 * @param {string} after - Text to insert after selection
 */
function insertMarkdown(before, after) {
  const start = editor.selectionStart;
  const end = editor.selectionEnd;
  const selectedText = editor.value.substring(start, end);

  const newText = before + selectedText + after;
  editor.value =
    editor.value.substring(0, start) + newText + editor.value.substring(end);

  // Position cursor appropriately
  if (selectedText) {
    editor.selectionStart = start;
    editor.selectionEnd = start + newText.length;
  } else {
    editor.selectionStart = editor.selectionEnd = start + before.length;
  }

  editor.focus();
  updatePreview();
  updateStatusBar();
}

/**
 * Insert or toggle heading at current line
 * @param {number} level - Heading level (1-6)
 */
function insertHeading(level) {
  const start = editor.selectionStart;
  const end = editor.selectionEnd;
  const text = editor.value;

  // Find start of the line where selection begins
  let lineStart = text.lastIndexOf("\n", start - 1) + 1;
  // Find end of the line where selection ends
  let lineEnd = text.indexOf("\n", end);
  if (lineEnd === -1) lineEnd = text.length;

  const currentLine = text.substring(lineStart, lineEnd);
  const match = currentLine.match(/^(#{1,6})\s/);

  let newLine = "";
  if (match) {
    // Existing heading
    const existingLevel = match[1].length;
    if (existingLevel === level) {
      // Toggle off if same level
      newLine = currentLine.substring(existingLevel + 1);
    } else {
      // Change level
      newLine =
        "#".repeat(level) + " " + currentLine.substring(existingLevel + 1);
    }
  } else {
    // No existing heading - add one
    newLine = "#".repeat(level) + " " + currentLine;
  }

  saveToUndoStack();
  editor.setRangeText(newLine, lineStart, lineEnd, "end");

  editor.focus();
  updatePreview();
  updateStatusBar();

  // Update toolbar icon
  const icon = document.getElementById("current-heading-icon");
  if (icon) {
    icon.textContent = "format_h" + level;
  }
}

/**
 * Insert list prefix at current line
 * @param {string} prefix - List prefix (e.g., '- ' or '1. ')
 */

function insertList(prefix) {
  const start = editor.selectionStart;
  const end = editor.selectionEnd;
  const text = editor.value;

  // Find start of the line where selection begins
  let lineStart = text.lastIndexOf("\n", start - 1) + 1;
  let lineEnd = text.indexOf("\n", end);
  if (lineEnd === -1) lineEnd = text.length;

  // We only support single line or bulk toggle? Let's just do single line insert for now or upgrade to multiline
  // If multiline selection, apply to all lines
  const substring = text.substring(lineStart, lineEnd);
  const lines = substring.split("\n");
  let newSubstring = "";

  // Check if we are already a list of this type
  const isAlreadyList = new RegExp(
    `^\\s*${prefix === "- " ? "[\\*\\-\\+]" : "\\d+\\."}`,
  ).test(lines[0]);

  for (let i = 0; i < lines.length; i++) {
    if (isAlreadyList) {
      // Remove list formatting
      newSubstring +=
        lines[i].replace(/^\s*(?:[\*\-\+]|\d+\.)\s+/, "") +
        (i < lines.length - 1 ? "\n" : "");
    } else {
      // Add list formatting
      newSubstring += prefix + lines[i] + (i < lines.length - 1 ? "\n" : "");
    }
  }

  saveToUndoStack();
  editor.setRangeText(newSubstring, lineStart, lineEnd, "select");
  editor.focus();
  updatePreview();
  updateStatusBar();
}

/**
 * Indent selected text (add 4 spaces)
 */
function indentText() {
  const start = editor.selectionStart;
  const end = editor.selectionEnd;
  const text = editor.value;

  let lineStart = text.lastIndexOf("\n", start - 1) + 1;
  let lineEnd = text.indexOf("\n", end);
  if (lineEnd === -1) lineEnd = text.length;

  const selectedLines = text.substring(lineStart, lineEnd);
  const indented = selectedLines.replace(/^/gm, "    ");

  saveToUndoStack();
  editor.setRangeText(indented, lineStart, lineEnd, "select");
  updatePreview();
  updateStatusBar();
}

/**
 * Outdent selected text (remove 4 spaces or tab)
 */
function outdentText() {
  const start = editor.selectionStart;
  const end = editor.selectionEnd;
  const text = editor.value;

  let lineStart = text.lastIndexOf("\n", start - 1) + 1;
  let lineEnd = text.indexOf("\n", end);
  if (lineEnd === -1) lineEnd = text.length;

  const selectedLines = text.substring(lineStart, lineEnd);
  // Remove up to 4 spaces or a tab
  const outdented = selectedLines.replace(/^(?:    |\t)/gm, "");

  saveToUndoStack();
  editor.setRangeText(outdented, lineStart, lineEnd, "select");
  updatePreview();
  updateStatusBar();
}

/**
 * Launch link insertion dialog
 */
function insertLink() {
  showLinkImageDialog("link");
}

/**
 * Launch image insertion dialog
 */
function insertImage() {
  showLinkImageDialog("image");
}

/**
 * Insert table with specified dimensions
 * @param {number} cols - Number of columns
 * @param {number} rows - Number of rows
 */
function insertTable(cols = 2, rows = 2) {
  const start = editor.selectionStart;

  // Generate header row
  let tableTemplate = "|";
  for (let i = 1; i <= cols; i++) {
    tableTemplate += ` Header ${i} |`;
  }
  tableTemplate += "\n|";

  // Generate separator row
  for (let i = 0; i < cols; i++) {
    tableTemplate += " -------- |";
  }
  tableTemplate += "\n";

  // Generate data rows
  for (let r = 1; r <= rows; r++) {
    tableTemplate += "|";
    for (let c = 1; c <= cols; c++) {
      tableTemplate += ` Cell ${r}-${c} |`;
    }
    tableTemplate += "\n";
  }

  // Ensure we start on a new line if not already
  const ls = editor.value.lastIndexOf("\n", start - 1) + 1;
  const prefix = ls === start ? "" : "\n\n";

  const snippet = prefix + tableTemplate;

  editor.setRangeText(snippet, start, editor.selectionEnd, "end");
  editor.focus();
  updatePreview();
  updateStatusBar();
}

/**
 * Initialize table grid selector
 */
function initTableGrid() {
  const grid = document.getElementById("table-grid");
  const preview = document.getElementById("table-grid-preview");

  if (!grid || !preview) return;

  let selectedCols = 1;
  let selectedRows = 1;

  // Create 5x5 grid
  for (let row = 0; row < 5; row++) {
    for (let col = 0; col < 5; col++) {
      const cell = document.createElement("div");
      cell.className = "table-grid-cell";
      cell.dataset.row = row + 1;
      cell.dataset.col = col + 1;

      cell.addEventListener("mouseenter", function () {
        const hoverRow = parseInt(this.dataset.row);
        const hoverCol = parseInt(this.dataset.col);

        // Update preview
        preview.textContent = `${hoverCol} x ${hoverRow}`;

        // Highlight cells
        document.querySelectorAll(".table-grid-cell").forEach((c) => {
          const cellRow = parseInt(c.dataset.row);
          const cellCol = parseInt(c.dataset.col);

          if (cellRow <= hoverRow && cellCol <= hoverCol) {
            c.classList.add("active");
          } else {
            c.classList.remove("active");
          }
        });
      });

      cell.addEventListener("click", function (e) {
        selectedRows = parseInt(this.dataset.row);
        selectedCols = parseInt(this.dataset.col);
        insertTable(selectedCols, selectedRows);
        closeAllMenus();
        e.preventDefault();
        e.stopPropagation();
      });

      grid.appendChild(cell);
    }
  }

  // Reset on mouse leave
  grid.addEventListener("mouseleave", function () {
    preview.textContent = "1 x 1";
    document.querySelectorAll(".table-grid-cell").forEach((c) => {
      c.classList.remove("active");
    });
  });
}

/**
 * Initialize manual table insertion
 */
function initTableManual() {
  const btnManual = document.getElementById("btn-table-manual");
  const dialog = document.getElementById("table-dialog");
  const colsInput = document.getElementById("table-cols");
  const rowsInput = document.getElementById("table-rows");
  const btnInsert = document.getElementById("table-insert");
  const btnCancel = document.getElementById("table-cancel");
  const overlay = document.getElementById("popup-overlay");

  if (!btnManual || !dialog) return;

  // Show dialog
  btnManual.addEventListener("click", function (e) {
    // Close all menus manually
    closeAllMenus();

    // Prevent immediate closing if bubbling
    e.stopPropagation();

    dialog.style.display = "block";
    overlay.style.display = "block";
    // Force reflow for transition
    void dialog.offsetWidth;
    dialog.classList.add("open");
    overlay.classList.add("open");
    colsInput.focus();
  });

  // Insert action
  function doInsert() {
    const cols = parseInt(colsInput.value) || 1;
    const rows = parseInt(rowsInput.value) || 1;
    insertTable(cols, rows);
    closeDialog();
  }

  // Close action
  function closeDialog() {
    dialog.classList.remove("open");
    overlay.classList.remove("open");
    setTimeout(() => {
      dialog.style.display = "none";
      overlay.style.display = "none";
    }, 300);
  }

  btnInsert.addEventListener("click", doInsert);
  btnCancel.addEventListener("click", closeDialog);

  // Enter key support
  [colsInput, rowsInput].forEach((input) => {
    input.addEventListener("keydown", function (e) {
      if (e.key === "Enter") doInsert();
      if (e.key === "Escape") closeDialog();
    });
  });
}

/**
 * Align the table where the cursor is currently located
 * @param {string} alignment - 'left', 'center', or 'right'
 */
function alignTable(alignment) {
  const start = editor.selectionStart;
  const text = editor.value;

  // 1. Identify the table block bounds
  // Search backwards for table start
  let blockStart = text.lastIndexOf("\n", start - 1) + 1;
  while (blockStart > 0) {
    const prevLineEnd = blockStart - 1;
    const prevLineStart = text.lastIndexOf("\n", prevLineEnd - 1) + 1;
    const prevLine = text.substring(prevLineStart, prevLineEnd);
    if (!prevLine.trim().startsWith("|")) {
      break;
    }
    blockStart = prevLineStart;
  }

  // Search forwards for table end
  let blockEnd = text.indexOf("\n", start);
  if (blockEnd === -1) blockEnd = text.length;
  while (blockEnd < text.length) {
    const nextLineEnd = text.indexOf("\n", blockEnd + 1);
    const actualEnd = nextLineEnd === -1 ? text.length : nextLineEnd;
    const nextLine = text.substring(blockEnd + 1, actualEnd);
    if (!nextLine.trim().startsWith("|")) {
      break;
    }
    blockEnd = actualEnd;
  }

  // 2. Extract table lines
  const tableBlock = text.substring(blockStart, blockEnd);
  const lines = tableBlock.split("\n");

  // 3. Find separator row (must start with | and contain mostly -)
  let separatorIndex = -1;
  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    // Simple check: starts with | and contains - and maybe :
    if (/^\|\s*:?-+:?\s*\|/.test(trimmed)) {
      separatorIndex = i;
      break;
    }
  }

  if (separatorIndex === -1) {
    // No valid separator found, maybe not a table or cursor not in table
    return;
  }

  // 4. Modify separator row
  const separatorRow = lines[separatorIndex];
  const columns = separatorRow.split("|");

  // Determine new cell content based on alignment
  let cellMarker = " --- ";
  if (alignment === "center") cellMarker = " :---: ";
  else if (alignment === "right") cellMarker = " ---: ";
  else cellMarker = " :--- "; // left

  // Reconstruct row
  // Filter empty strings from split resulted from leading/trailing |
  const newColumns = columns.map((col, index) => {
    // Keep empty start/end if they existed to maintain | borders
    if (index === 0 && col === "") return "";
    if (index === columns.length - 1 && col === "") return "";
    // If it's a pipe-separated split, we expect empty strings at ends for |...|
    // But if there's no space? split('|') on '|a|' gives ['', 'a', '']
    return cellMarker;
  });

  // Fix: The map above replaces ALL content. We should respect the structure.
  // Better way: Rebuild the string.

  let newSeparatorRow = "|";
  // We need to know how many columns.
  // The columns array length in split includes the empty ends.
  // e.g. "| A | B |" -> split -> ["", " A ", " B ", ""] (4 items, 2 cols)
  // e.g. "A | B" -> split -> ["A ", " B"] (2 items, 2 cols)

  // Let's count actual columns by ignoring the first and last if they are empty
  // But modifying the array directly in map was risky if we don't handle indices right.

  // Let's try a safer regex replace approach for each column
  // or just rebuild it based on count.

  const colCount = columns.length - 2; // Assuming standard |...| format
  if (colCount > 0) {
    let newRow = "|";
    for (let k = 0; k < colCount; k++) {
      newRow += cellMarker + "|";
    }
    lines[separatorIndex] = newRow;
  } else {
    // Fallback for non-standard tables or just replace all inner parts
    // If it is just "A | B", split is length 2.
    // If " | A | B | ", split is length 4.
    // Let's assume standard grid | ... | ... |
    lines[separatorIndex] = separatorRow.replace(/:?-+:?/g, cellMarker.trim());
  }

  // 5. Replace text
  const newTableBlock = lines.join("\n");
  editor.setRangeText(newTableBlock, blockStart, blockEnd, "select");

  updatePreview();
  updateStatusBar();
}

/**
 * Insert horizontal rule at cursor
 */
function insertHorizontalRule() {
  const start = editor.selectionStart;
  const ls = editor.value.lastIndexOf("\n", start - 1) + 1;
  const prefix = ls === start ? "" : "\n";
  const snippet = `${prefix}---\n`;
  editor.setRangeText(snippet, start, start, "end");
  updatePreview();
  updateStatusBar();
}

/**
 * Remove formatting from selected text
 */
function removeFormatting() {
  const start = editor.selectionStart;
  const end = editor.selectionEnd;
  let selectedText = editor.value.substring(start, end);

  if (!selectedText) return;

  saveToUndoStack();

  // Remove formatting markers
  selectedText = selectedText
    // Remove bold/italic (** or __)
    .replace(/(\*\*|__)(.*?)\1/g, "$2")
    // Remove italic (* or _)
    .replace(/(\*|_)(.*?)\1/g, "$2")
    // Remove strikes (~~)
    .replace(/~~(.*?)~~/g, "$1")
    // Remove inline code (`)
    .replace(/`([^`]+)`/g, "$1")
    // Remove links (keep text)
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    // Remove images (keep alt text)
    .replace(/!\[([^\]]*)\]\([^)]+\)/g, "$1")
    // Remove headings
    .replace(/^#+\s+/gm, "")
    // Remove blockquotes
    .replace(/^>\s+/gm, "");

  editor.setRangeText(selectedText, start, end, "select");
  editor.focus();
  updatePreview();
  updateStatusBar();
}

// ========================================
// FILE OPERATIONS
// ========================================

/**
 * Create a new file (with confirmation if unsaved changes)
 */
/**
 * Create a new file (with confirmation if unsaved changes)
 */
function newFile() {
  if (editor.value.trim()) {
    showConfirm(
      "Are you sure you want to create a new file? Unsaved changes will be lost.",
      () => {
        resetEditor();
      },
      "New File",
    );
  } else {
    resetEditor();
  }
}

function resetEditor() {
  editor.value = "";
  currentFile = null;
  currentFileHandle = null;
  updatePreview();
  updateStatusBar();
  updateStatus("New file created");
}

/**
 * Show custom alert dialog
 */
function showAlert(message, title = "Alert") {
  const dialog = document.getElementById("custom-alert");
  const msgEl = document.getElementById("custom-alert-message");
  const titleEl = document.getElementById("custom-alert-title");
  const okBtn = document.getElementById("custom-alert-ok");

  if (!dialog) {
    alert(message); // Fallback
    return;
  }

  msgEl.textContent = message;
  if (titleEl) titleEl.textContent = title;
  showOverlay();
  openDialogElement(dialog);
  okBtn.focus();

  const handleOk = () => {
    closeDialog();
  };

  const closeDialog = () => {
    hideOverlay();
    closeDialogElement(dialog);
    okBtn.onclick = null;
  };

  okBtn.onclick = handleOk;
}

/**
 * Show custom confirm dialog
 */
function showConfirm(message, onConfirm, title = "Confirm") {
  const dialog = document.getElementById("custom-confirm");
  const msgEl = document.getElementById("custom-confirm-message");
  const titleEl = document.getElementById("custom-confirm-title");
  const okBtn = document.getElementById("custom-confirm-ok");
  const cancelBtn = document.getElementById("custom-confirm-cancel");

  if (!dialog) {
    if (confirm(message)) onConfirm(); // Fallback
    return;
  }

  msgEl.textContent = message;
  if (titleEl) titleEl.textContent = title;
  showOverlay();
  openDialogElement(dialog);
  okBtn.focus();

  const handleOk = () => {
    closeDialog();
    if (typeof onConfirm === "function") onConfirm();
  };

  const handleCancel = () => {
    closeDialog();
  };

  const closeDialog = () => {
    hideOverlay();
    closeDialogElement(dialog);
    okBtn.onclick = null;
    cancelBtn.onclick = null;
  };

  okBtn.onclick = handleOk;
  cancelBtn.onclick = handleCancel;
}

// Expose to window for HTML access
window.showAlert = showAlert;
window.showConfirm = showConfirm;

/**
 * Open file dialog
 */
async function openFile() {
  if (window.showOpenFilePicker) {
    try {
      const [handle] = await window.showOpenFilePicker({
        types: [
          {
            description: "Markdown & Text Files",
            accept: {
              "text/markdown": [".md", ".markdown"],
              "text/plain": [".txt", ".text", ".ini", ".log"],
            },
          },
        ],
        multiple: false,
      });
      const file = await handle.getFile();
      const contents = await file.text();

      editor.value = contents;
      currentFile = file.name;
      currentFileHandle = handle;
      updatePreview();
      updateStatusBar();
      updateStatus(`Opened: ${file.name}`);
    } catch (err) {
      // User cancelled or error
      if (err.name !== "AbortError") {
        console.error("Open File Error:", err);
      }
    }
  } else {
    document.getElementById("file-input").click();
  }
}

/**
 * Handle file selection from file input
 * @param {Event} e - Change event from file input
 */
function handleFileSelect(e) {
  const file = e.target.files[0];
  if (file) {
    const reader = new FileReader();
    reader.onload = function (event) {
      editor.value = event.target.result;
      currentFile = file.name;
      currentFileHandle = null; // Clear handle as we can't write back to legacy input
      updatePreview();
      updateStatusBar();
      updateStatus(`Opened: ${file.name}`);
    };
    reader.readAsText(file);
  }
}

/**
 * Save/download the current file
 */
async function saveFile() {
  if (currentFileHandle) {
    // Write to existing handle
    try {
      await writeFile(currentFileHandle, editor.value);
      updateStatus(`Saved: ${currentFile}`);
    } catch (err) {
      console.error("Save Error:", err);
      alert("Failed to save file. You may need to use Save As.");
    }
  } else if (currentFile) {
    // Legacy save (download)
    performSave(currentFile);
  } else {
    // New file
    saveAsFile();
  }
}

/**
 * Save As with File System Access API support
 */
async function saveAsFile() {
  if (window.showSaveFilePicker) {
    try {
      const handle = await window.showSaveFilePicker({
        suggestedName: currentFile || "document.md",
        types: [
          {
            description: "Markdown File",
            accept: { "text/markdown": [".md"] },
          },
          {
            description: "Text File",
            accept: { "text/plain": [".txt", ".ini", ".log"] },
          },
        ],
      });
      await writeFile(handle, editor.value);
      currentFileHandle = handle;
      const file = await handle.getFile();
      currentFile = file.name;
      updateStatus(`Saved: ${currentFile}`);
    } catch (err) {
      if (err.name !== "AbortError") {
        console.error("Save As Error:", err);
        // Fallback to legacy dialog if picker technically fails but not cancelled?
        // Probably better to let user retry or manually check support.
        // Assuming AbortError is just cancel.
      }
    }
  } else {
    showSaveAsDialog();
  }
}

/**
 * Write content to file handle
 */
async function writeFile(fileHandle, contents) {
  const writable = await fileHandle.createWritable();
  await writable.write(contents);
  await writable.close();
}

/**
 * Perform the actual save operation with a specific filename
 * @param {string} filenameToUse
 */
function performSave(filenameToUse) {
  const content = editor.value;
  let filename = filenameToUse;

  // Ensure extension
  if (!/\.(md|markdown|txt|text|ini|log)$/i.test(filename)) {
    filename += ".md";
  }

  // Determine MIME type
  let type = "text/markdown";
  if (/\.(txt|text|ini|log)$/i.test(filename)) {
    type = "text/plain";
  }

  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);

  // Update current file if we just saved it
  currentFile = filename;
  updateStatus(`Saved: ${filename}`);
}

/**
 * Show Save As dialog
 */
function showSaveAsDialog() {
  const dialog = document.getElementById("save-as-dialog");
  const input = document.getElementById("save-as-filename");
  const btnOk = document.getElementById("save-as-ok");
  const btnCancel = document.getElementById("save-as-cancel");
  const overlay = document.getElementById("popup-overlay");

  if (!dialog) return;

  // Pre-fill filename
  input.value = currentFile || "document.md";

  // Show dialog
  overlay.style.display = "block";
  dialog.style.display = "block";
  void dialog.offsetWidth; // Force reflow
  dialog.classList.add("open");
  overlay.classList.add("open");
  input.focus();
  input.select(); // Select all text for easy overwriting

  const closeDialog = () => {
    dialog.classList.remove("open");
    overlay.classList.remove("open");
    setTimeout(() => {
      dialog.style.display = "none";
      overlay.style.display = "none";
    }, 300);

    // Remove listeners to avoid duplicates
    btnOk.removeEventListener("click", handleOk);
    btnCancel.removeEventListener("click", closeDialog);
    input.removeEventListener("keydown", handleKey);
  };

  const handleOk = () => {
    let filename = input.value.trim();
    if (filename) {
      performSave(filename);
      closeDialog();
    }
  };

  const handleKey = (e) => {
    if (e.key === "Enter") handleOk();
    if (e.key === "Escape") closeDialog();
  };

  btnOk.addEventListener("click", handleOk);
  btnCancel.addEventListener("click", closeDialog);
  input.addEventListener("keydown", handleKey);
}

/**
 * Print the current document
 */
function printDocument() {
  updatePreview();
  window.print();
}

// ========================================
// UNDO/REDO
// ========================================

/**
 * Save current state to undo stack
 */
function saveToUndoStack() {
  undoStack.push(editor.value);
  if (undoStack.length > 50) {
    undoStack.shift();
  }
  redoStack = [];
}

/**
 * Undo last change
 */
function undo() {
  if (undoStack.length > 1) {
    redoStack.push(undoStack.pop());
    editor.value = undoStack[undoStack.length - 1] || "";
    updatePreview();
    updateStatusBar();
  }
  // refresh menu/toolbar state if available
  if (typeof updateEditMenuStates === "function") {
    updateEditMenuStates();
  }
}

/**
 * Redo last undone change
 */
function redo() {
  if (redoStack.length > 0) {
    const redoValue = redoStack.pop();
    undoStack.push(redoValue);
    editor.value = redoValue;
    updatePreview();
    updateStatusBar();
  }
  // refresh menu/toolbar state
  if (typeof updateEditMenuStates === "function") {
    updateEditMenuStates();
  }
}

// ========================================
// FIND & REPLACE
// ========================================

/**
 * Toggle find/replace bar visibility
 * @param {boolean} openReplace - Whether to open with replace field focused
 */
function toggleFindReplace(openReplace) {
  const bar = document.getElementById("find-replace-bar");
  const isVisible = bar.classList.contains("open");

  if (!isVisible) {
    // Open logic
    bar.style.display = "block";
    // Force reflow
    void bar.offsetWidth;
    bar.classList.add("open");

    // Ensure centered position and accessibility attributes
    bar.setAttribute("aria-hidden", "false");
    bar.setAttribute("aria-controls", "editor");

    if (openReplace) {
      const replaceInput = document.getElementById("replace-input");
      if (replaceInput) replaceInput.focus();
      // Ensure expanded mode if opening replace specifically?
      // The user didn't request auto-expand on replace click from menu, but it's good UX.
      // For now, respect current state or manual toggle.
    } else {
      document.getElementById("find-input").focus();
    }
    updateMatches(document.getElementById("find-input").value || "");
    closeAllMenus();
  } else {
    closeFindReplace();
  }
}

/**
 * Close find/replace bar with animation
 */
function closeFindReplace() {
  const bar = document.getElementById("find-replace-bar");
  if (!bar) return;

  removeHighlights();

  bar.classList.remove("open");
  bar.setAttribute("aria-hidden", "true");
  editor.focus();

  // Wait for transition to finish before hiding
  // We use a one-time event listener or a timeout matching CSS transition
  const cleanup = () => {
    if (!bar.classList.contains("open")) {
      bar.style.display = "none";
    }
  };

  // Safety timeout in case transitionend doesn't fire (e.g. hidden tab)
  setTimeout(cleanup, 250);
}

/**
 * Update matches for current query
 * @param {string} query - Search query
 */
function updateMatches(query) {
  findState.matches = [];
  findState.currentIndex = -1;
  const cs =
    document.getElementById("case-sensitive") &&
    document.getElementById("case-sensitive").checked;
  const useRegex =
    document.getElementById("use-regex") &&
    document.getElementById("use-regex").checked;
  if (!query) {
    updateMatchCount();
    return;
  }
  const text = editor.value;
  if (useRegex) {
    // build flags string from flag checkboxes
    // build flags string - now simplified to just 'g' and optional 'i'
    let flags = "g";
    if (!cs) flags += "i";
    let re;
    try {
      re = new RegExp(query, flags);
    } catch (err) {
      const el = document.getElementById("match-count");
      if (el) el.textContent = "Invalid regex";
      return;
    }
    let m;
    while ((m = re.exec(text)) !== null) {
      findState.matches.push({ start: m.index, end: m.index + m[0].length });
      if (m.index === re.lastIndex) re.lastIndex++; // avoid infinite loop on zero-length matches
    }
    updateMatchCount();
    // Highlight matches in preview for regex mode as well
    highlightMatches();
    return;
  }
  // plain substring search
  let hay = text;
  let needle = query;
  if (!cs) {
    hay = text.toLowerCase();
    needle = query.toLowerCase();
  }
  let startIndex = 0;
  while (true) {
    const idx = hay.indexOf(needle, startIndex);
    if (idx === -1) break;
    findState.matches.push({ start: idx, end: idx + query.length });
    startIndex = idx + query.length;
  }
  updateMatchCount();
  highlightMatches();
}

/**
 * Highlight matches in preview pane
 */
/**
 * Remove search highlights from preview
 */
function removeHighlights() {
  const preview = document.getElementById("preview");
  if (!preview) return;

  const highlights = preview.querySelectorAll("span.md-match");
  highlights.forEach((span) => {
    const parent = span.parentNode;
    while (span.firstChild) {
      parent.insertBefore(span.firstChild, span);
    }
    parent.removeChild(span);
  });
  preview.normalize();
}

function highlightMatches() {
  const preview = document.getElementById("preview");
  if (!preview) return;

  // 1. Remove existing highlights
  removeHighlights();

  // 2. Get search query
  const query = document.getElementById("find-input").value;
  if (!query) return;

  // 3. Prepare Regex
  const cs =
    document.getElementById("case-sensitive") &&
    document.getElementById("case-sensitive").checked;
  const useRegex =
    document.getElementById("use-regex") &&
    document.getElementById("use-regex").checked;

  let regex;
  try {
    if (useRegex) {
      let flags = "g";
      if (!cs) flags += "i";
      regex = new RegExp(query, flags);
    } else {
      // Escape special chars for literal search
      const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      regex = new RegExp(escaped, cs ? "g" : "gi");
    }
  } catch (e) {
    return;
  }

  // 4. Walk Text Nodes & Highlight
  // We collect nodes first to avoid issues with live TreeWalker during modification
  const walker = document.createTreeWalker(
    preview,
    NodeFilter.SHOW_TEXT,
    null,
    false,
  );
  const textNodes = [];
  let node;
  while ((node = walker.nextNode())) {
    textNodes.push(node);
  }

  textNodes.forEach((node) => {
    highlightTextNode(node, regex);
  });
}

/**
 * Helper to highlight regex matches in a single text node
 * @param {Node} node - The text node to process
 * @param {RegExp} regex - The regex to match
 */
function highlightTextNode(node, regex) {
  const text = node.nodeValue;
  if (!text) return;

  // Find all matches first
  regex.lastIndex = 0;
  const matches = [];
  let match;
  while ((match = regex.exec(text)) !== null) {
    matches.push({ start: match.index, length: match[0].length });
    if (regex.lastIndex === match.index) regex.lastIndex++; // Loop protection
    if (!regex.flags.includes("g")) break;
  }

  if (matches.length === 0) return;

  // Process backwards to preserve indices
  for (let i = matches.length - 1; i >= 0; i--) {
    const m = matches[i];

    // Split node: [prefix] [match] [rest]
    const contentNode = node.splitText(m.start);
    contentNode.splitText(m.length);

    // Create highlight element
    const mark = document.createElement("span");
    mark.className = "md-match";
    mark.textContent = contentNode.nodeValue;

    // Replace matching text node with span
    contentNode.parentNode.replaceChild(mark, contentNode);
  }
}

/**
 * Highlight and select a specific match
 * @param {number} index - Index of match to highlight
 */
function highlightMatch(index) {
  if (index < 0 || index >= findState.matches.length) return;
  const m = findState.matches[index];
  editor.selectionStart = m.start;
  editor.selectionEnd = m.end;
  editor.focus();
  updateMatchCount();
}

/**
 * Update match count display
 */
function updateMatchCount() {
  const el = document.getElementById("match-count");
  const total = findState.matches.length;
  const current =
    findState.currentIndex >= 0 && total > 0 ? findState.currentIndex + 1 : 0;
  if (el) el.textContent = `${current} / ${total}`;
}

/**
 * Find next match
 */
function findNext() {
  const q = document.getElementById("find-input").value;
  if (q !== findState.lastQuery) {
    findState.lastQuery = q;
    updateMatches(q);
  }
  if (findState.matches.length === 0) return;

  // Save history
  addToFindHistory(q);

  const wrap =
    document.getElementById("wrap-around") &&
    document.getElementById("wrap-around").checked;
  let nextIndex = findState.currentIndex + 1;

  if (nextIndex >= findState.matches.length) {
    if (wrap) {
      nextIndex = 0;
    } else {
      nextIndex = findState.matches.length - 1; // Stay at last match
    }
  }

  findState.currentIndex = nextIndex;
  highlightMatch(findState.currentIndex);
  highlightMatches();
}

/**
 * Find previous match
 */
function findPrev() {
  const q = document.getElementById("find-input").value;
  if (q !== findState.lastQuery) {
    findState.lastQuery = q;
    updateMatches(q);
  }
  if (findState.matches.length === 0) return;

  const wrap =
    document.getElementById("wrap-around") &&
    document.getElementById("wrap-around").checked;
  let nextIndex = findState.currentIndex - 1;

  if (nextIndex < 0) {
    if (wrap) {
      nextIndex = findState.matches.length - 1;
    } else {
      nextIndex = 0; // Stay at first match
    }
  }

  findState.currentIndex = nextIndex;
  highlightMatch(findState.currentIndex);
  highlightMatches();
}

/**
 * Replace current match
 */
function replaceOne() {
  const q = document.getElementById("find-input").value;
  const r = document.getElementById("replace-input").value;
  if (!q) return;
  // If regex mode, use regex replace semantics
  const cs =
    document.getElementById("case-sensitive") &&
    document.getElementById("case-sensitive").checked;
  const useRegex =
    document.getElementById("use-regex") &&
    document.getElementById("use-regex").checked;
  if (useRegex) {
    try {
      const flags = cs ? "" : "i";
      const re = new RegExp(q, flags);
      const selected = editor.value.substring(
        editor.selectionStart,
        editor.selectionEnd,
      );
      if (selected && re.test(selected)) {
        saveToUndoStack();
        const replaced = selected.replace(re, r);
        editor.setRangeText(
          replaced,
          editor.selectionStart,
          editor.selectionEnd,
          "end",
        );
        updatePreview();
        updateStatusBar();
        updateMatches(q);
        return;
      }
      findNext();
      const sel = editor.value.substring(
        editor.selectionStart,
        editor.selectionEnd,
      );
      if (sel && re.test(sel)) {
        saveToUndoStack();
        const replaced2 = sel.replace(re, r);
        editor.setRangeText(
          replaced2,
          editor.selectionStart,
          editor.selectionEnd,
          "end",
        );
        updatePreview();
        updateStatusBar();
        updateMatches(q);
      }
    } catch (err) {
      const el = document.getElementById("match-count");
      if (el) el.textContent = "Invalid regex";
    }
    return;
  }
  // plain substring replace
  const selected = editor.value.substring(
    editor.selectionStart,
    editor.selectionEnd,
  );
  const matchesSelected =
    selected &&
    ((cs && selected === q) ||
      (!cs && selected.toLowerCase() === q.toLowerCase()));
  if (matchesSelected) {
    saveToUndoStack();
    addToFindHistory(q);
    addToReplaceHistory(r);
    editor.setRangeText(r, editor.selectionStart, editor.selectionEnd, "end");
    updatePreview();
    updateStatusBar();
    updateMatches(q);
  } else {
    findNext();
    const sel = editor.value.substring(
      editor.selectionStart,
      editor.selectionEnd,
    );
    const selMatches =
      sel &&
      ((cs && sel === q) || (!cs && sel.toLowerCase() === q.toLowerCase()));
    if (selMatches) {
      saveToUndoStack();
      addToFindHistory(q);
      addToReplaceHistory(r);
      editor.setRangeText(r, editor.selectionStart, editor.selectionEnd, "end");
      updatePreview();
      updateStatusBar();
      updateMatches(q);
    }
  }
}

/**
 * Replace all matches
 */
function replaceAll() {
  const q = document.getElementById("find-input").value;
  const r = document.getElementById("replace-input").value;
  if (!q) return;
  const cs =
    document.getElementById("case-sensitive") &&
    document.getElementById("case-sensitive").checked;
  const useRegex =
    document.getElementById("use-regex") &&
    document.getElementById("use-regex").checked;
  const text = editor.value;
  if (useRegex) {
    let flags = "g";
    if (!cs) flags += "i";
    // include any checked flag checkboxes
    document.querySelectorAll(".flag-checkbox:checked").forEach((b) => {
      const f = b.getAttribute("data-flag");
      if (f && !flags.includes(f)) flags += f;
    });
    try {
      const re = new RegExp(q, flags);
      if (!re.test(text)) return;
      saveToUndoStack();
      addToFindHistory(q);
      addToReplaceHistory(r);
      editor.value = text.replace(re, r);
      updatePreview();
      updateStatusBar();
      updateMatches(q);
    } catch (err) {
      const el = document.getElementById("match-count");
      if (el) el.textContent = "Invalid regex";
    }
    return;
  }
  const hay = cs ? text : text.toLowerCase();
  const needle = cs ? q : q.toLowerCase();
  if (hay.indexOf(needle) === -1) return;
  saveToUndoStack();
  addToFindHistory(q);
  addToReplaceHistory(r);
  if (cs) {
    editor.value = text.split(q).join(r);
  } else {
    // Case-insensitive replace: do a simple global replace
    let result = "";
    let idx = 0;
    while (idx < text.length) {
      const segment = text.substring(idx);
      const pos = segment.toLowerCase().indexOf(needle);
      if (pos === -1) {
        result += segment;
        break;
      }
      result += segment.substring(0, pos) + r;
      idx += pos + q.length;
    }
    editor.value = result;
  }
  updatePreview();
  updateStatusBar();
  updateMatches(q);
}

// ========================================
// HISTORY SUGGESTIONS
// ========================================

const MAX_HISTORY = 10;
let findHistory = [];
let replaceHistory = [];

try {
  findHistory = JSON.parse(localStorage.getItem("md-find-history-v2") || "[]");
  replaceHistory = JSON.parse(
    localStorage.getItem("md-replace-history-v2") || "[]",
  );
} catch (e) { }

function addToFindHistory(term) {
  if (!term || term.trim() === "") return;
  // Remove if exists to move to top
  findHistory = findHistory.filter((h) => h !== term);
  findHistory.unshift(term);
  if (findHistory.length > MAX_HISTORY) findHistory.pop();
  try {
    localStorage.setItem("md-find-history-v2", JSON.stringify(findHistory));
  } catch (e) { }
}

function addToReplaceHistory(term) {
  if (!term) return; // Allow empty string for replace? Maybe, but usually not useful for history. Let's allow non-empty.
  if (term.trim() === "") return;
  replaceHistory = replaceHistory.filter((h) => h !== term);
  replaceHistory.unshift(term);
  if (replaceHistory.length > MAX_HISTORY) replaceHistory.pop();
  try {
    localStorage.setItem(
      "md-replace-history-v2",
      JSON.stringify(replaceHistory),
    );
  } catch (e) { }
}

function setupFindReplaceHistory() {
  setupHistoryInput(
    "find-input",
    "find-history",
    () => findHistory,
    (val) => {
      document.getElementById("find-input").value = val;
      updateMatches(val);
    },
  );
  setupHistoryInput(
    "replace-input",
    "replace-history",
    () => replaceHistory,
    (val) => {
      document.getElementById("replace-input").value = val;
    },
  );
}

function setupHistoryInput(inputId, dropdownId, getHistoryFn, onSelect) {
  const input = document.getElementById(inputId);
  const dropdown = document.getElementById(dropdownId);
  if (!input || !dropdown) return;

  function showSuggestions(filterText) {
    const history = getHistoryFn();
    const filtered = filterText
      ? history.filter((h) =>
        h.toLowerCase().includes(filterText.toLowerCase()),
      )
      : history;

    dropdown.innerHTML = "";
    if (filtered.length === 0) {
      dropdown.classList.remove("open");
      return;
    }

    filtered.forEach((item) => {
      const div = document.createElement("div");
      div.className = "history-item";
      // Highlight match
      if (filterText) {
        const idx = item.toLowerCase().indexOf(filterText.toLowerCase());
        if (idx >= 0) {
          div.innerHTML =
            escapeHtml(item.substring(0, idx)) +
            '<span class="match-highlight">' +
            escapeHtml(item.substring(idx, idx + filterText.length)) +
            "</span>" +
            escapeHtml(item.substring(idx + filterText.length));
        } else {
          div.textContent = item;
        }
      } else {
        div.textContent = item;
      }

      div.addEventListener("mousedown", (e) => {
        // mousedown happens before blur
        e.preventDefault(); // prevent blur
        onSelect(item);
        dropdown.classList.remove("open");
      });
      dropdown.appendChild(div);
    });
    dropdown.classList.add("open");
  }

  input.addEventListener("input", () => showSuggestions(input.value));
  input.addEventListener("focus", () => showSuggestions(input.value));
  input.addEventListener("blur", () => {
    setTimeout(() => dropdown.classList.remove("open"), 150);
  });
  input.addEventListener("keydown", (e) => {
    if (e.key === "Escape") dropdown.classList.remove("open");
  });
}

// ========================================
// KEYBOARD SHORTCUTS
// ========================================

/**
 * Handle keyboard shortcuts
 * @param {KeyboardEvent} e - Keyboard event
 */
function handleKeyboardShortcuts(e) {
  if (e.ctrlKey || e.metaKey) {
    switch (e.key) {
      case "n":
        e.preventDefault();
        newFile();
        break;
      case "o":
        e.preventDefault();
        openFile();
        break;
      case "s":
        e.preventDefault();
        saveFile();
        break;
      case "z":
        e.preventDefault();
        if (e.shiftKey) {
          redo();
        } else {
          undo();
        }
        break;
      case "b":
        e.preventDefault();
        insertMarkdown("**", "**");
        break;
      case "i":
        e.preventDefault();
        insertMarkdown("*", "*");
        break;
      case "f":
        e.preventDefault();
        toggleFindReplace();
        break;
      case "h":
        e.preventDefault();
        toggleFindReplace();
        document.getElementById("replace-input").focus();
        break;
    }
  }
}

// ========================================
// ANIMATED ICONS
// ========================================

/**
 * Helper to interpolate and animate SVG attributes manually
 */
function animateSvgAttribute(element, attr, keyframes, duration) {
  const start = performance.now();
  const startValue = parseInt(element.getAttribute(attr), 10);

  // Keyframes: e.g. [10, 4, 10]
  // Timings: 0 -> 0.5 -> 1.0 (assuming equal spacing)

  function update(time) {
    const elapsed = time - start;
    const progress = Math.min(elapsed / duration, 1);

    let value;
    // Simple 3-point interpolation for [start, mid, end]
    if (keyframes.length === 3) {
      if (progress < 0.5) {
        // 0 to 0.5 -> keyframe 0 to 1
        const localP = progress * 2;
        value =
          keyframes[0] + (keyframes[1] - keyframes[0]) * easeInOut(localP);
      } else {
        // 0.5 to 1.0 -> keyframe 1 to 2
        const localP = (progress - 0.5) * 2;
        value =
          keyframes[1] + (keyframes[2] - keyframes[1]) * easeInOut(localP);
      }
    } else if (keyframes.length === 2) {
      value =
        keyframes[0] + (keyframes[1] - keyframes[0]) * easeInOut(progress);
    }

    element.setAttribute(attr, value);

    if (progress < 1) {
      requestAnimationFrame(update);
    }
  }
  requestAnimationFrame(update);
}

function easeInOut(t) {
  return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
}

/**
 * createSlidersHorizontalIcon
 * @param {HTMLElement} container
 */
function createSlidersHorizontalIcon(container) {
  if (!container) return;
  container.innerHTML = "";
  const ns = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(ns, "svg");
  svg.setAttribute("width", "18");
  svg.setAttribute("height", "18");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("fill", "none");
  svg.setAttribute("stroke", "currentColor");
  svg.setAttribute("stroke-width", "2");
  svg.setAttribute("stroke-linecap", "round");
  svg.setAttribute("stroke-linejoin", "round");

  const linesConfig = [
    { x1: 3, y1: 5, x2: 10, y2: 5, id: "line1", animate: { x2: [10, 4, 10] } },
    {
      x1: 14,
      y1: 3,
      x2: 14,
      y2: 7,
      id: "line2",
      animate: { x1: [14, 8, 14], x2: [14, 8, 14] },
    },
    { x1: 14, y1: 5, x2: 21, y2: 5, id: "line3", animate: { x1: [14, 8, 14] } },
    { x1: 3, y1: 12, x2: 8, y2: 12, id: "line4", animate: { x2: [8, 16, 8] } },
    {
      x1: 8,
      y1: 10,
      x2: 8,
      y2: 14,
      id: "line5",
      animate: { x1: [8, 16, 8], x2: [8, 16, 8] },
    },
    {
      x1: 12,
      y1: 12,
      x2: 21,
      y2: 12,
      id: "line6",
      animate: { x1: [12, 20, 12] },
    },
    {
      x1: 3,
      y1: 19,
      x2: 12,
      y2: 19,
      id: "line7",
      animate: { x2: [12, 7, 12] },
    },
    {
      x1: 16,
      y1: 17,
      x2: 16,
      y2: 21,
      id: "line8",
      animate: { x1: [16, 11, 16], x2: [16, 11, 16] },
    },
    {
      x1: 16,
      y1: 19,
      x2: 21,
      y2: 19,
      id: "line9",
      animate: { x1: [16, 11, 16] },
    },
  ];

  const lines = {};
  linesConfig.forEach((cfg) => {
    const line = document.createElementNS(ns, "line");
    ["x1", "y1", "x2", "y2"].forEach((attr) =>
      line.setAttribute(attr, cfg[attr]),
    );
    svg.appendChild(line);
    lines[cfg.id] = { el: line, config: cfg };
  });
  container.appendChild(svg);

  container.addEventListener("click", () => {
    linesConfig.forEach((cfg) => {
      const el = lines[cfg.id].el;
      if (cfg.animate.x1) animateSvgAttribute(el, "x1", cfg.animate.x1, 800);
      if (cfg.animate.x2) animateSvgAttribute(el, "x2", cfg.animate.x2, 800);
      if (cfg.animate.y1) animateSvgAttribute(el, "y1", cfg.animate.y1, 800);
    });
  });
}

/**
 * createChevronIcon
 * @param {HTMLElement} container
 */
function createChevronIcon(container) {
  if (!container) return null;
  container.innerHTML = "";
  const ns = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(ns, "svg");
  svg.setAttribute("width", "20");
  svg.setAttribute("height", "20");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("fill", "none");
  svg.setAttribute("stroke", "currentColor");
  svg.setAttribute("stroke-width", "2");
  svg.setAttribute("stroke-linecap", "round");
  svg.setAttribute("stroke-linejoin", "round");

  const path = document.createElementNS(ns, "path");
  // Initial state: ChevronDown (points down, for "Expand" action if compact, or just default)
  // d="m6 9 6 6 6-6" is Down
  // d="m18 15-6-6-6 6" is Up

  // We'll control logic:
  // If compact -> show Down (clicking expands).
  // If expand -> show Up (clicking collapses).

  // Actually, let's keep one path and morph D? Or rotate?
  // User asked for specific "y" animation bounce of the path.
  // Down path: "m6 9 6 6 6-6". Center is around y=12?
  // Up path: "m18 15-6-6-6 6".

  // Let's rely on standard rotation or simpler path swap + bounce.
  // The user's code had different `d` for Up and Down.
  // ChevronDown: d="m6 9 6 6 6-6"
  // ChevronUp: d="m18 15-6-6-6 6" (which is just inverted coordinate-wise or rotated).

  // Let's implement setIconState(isUp)

  let isUp = false; // Default Down
  path.setAttribute("d", "m6 9 6 6 6-6");
  svg.appendChild(path);
  container.appendChild(svg);

  const api = {
    setDirection: (direction) => {
      // direction 'up' or 'down'
      isUp = direction === "up";
      if (isUp) {
        path.setAttribute("d", "m18 15-6-6-6 6"); // Up
      } else {
        path.setAttribute("d", "m6 9 6 6 6-6"); // Down
      }
    },
    animateBounce: () => {
      // Bounce effect: [0, 4, 0] if Down, [0, -4, 0] if Up
      // Wait, if we are "Down" (pointing down), we might bounce down?
      // User: "ChevronDown ... y: [0, 4, 0]" (downwards bounce)
      // User: "ChevronUp ... y: [0, -4, 0]" (upwards bounce)

      const keyframes = isUp
        ? [
          { transform: "translateY(0)" },
          { transform: "translateY(-4px)" },
          { transform: "translateY(0)" },
        ]
        : [
          { transform: "translateY(0)" },
          { transform: "translateY(4px)" },
          { transform: "translateY(0)" },
        ];

      path.animate(keyframes, {
        duration: 600,
        easing: "ease-in-out",
      });
    },
  };

  return api;
}

// Global hook for icon creation to be called from HTML
window.initAnimatedIcons = function () {
  createSlidersHorizontalIcon(document.getElementById("fr-flag-btn"));

  const toggleBtn = document.getElementById("fr-compact-toggle");
  if (toggleBtn) {
    const chevron = createChevronIcon(toggleBtn);
    // We need to sync with initial state.
    // Check local storage or existing class
    const bar = document.getElementById("find-replace-bar");
    const isCompact = bar ? bar.classList.contains("compact") : false;

    // Compact mode -> We see 1 row. Button should Expand. Icon: ChevronDown.
    // Expanded mode -> We see 2 rows. Button should Collapse. Icon: ChevronUp.
    if (isCompact) {
      chevron.setDirection("down");
    } else {
      chevron.setDirection("up");
    }

    // Add click listener to animate
    // Note: The actual toggling logic is in index.html's event listener.
    // We can add another listener here just for animation/icon update.
    toggleBtn.addEventListener("click", () => {
      // The state toggles after this click.
      // Current state (before toggle logic runs or concurrent):
      const willBeCompact = !document
        .getElementById("find-replace-bar")
        .classList.contains("compact");
      // Wait, logic in HTML toggles it.
      // If we run `click`, we don't know if we run before or after the other listener.
      // Safer to check state *after* a microtask or rely on button aria-pressed if updated?
      // The HTML logic toggles class immediately.

      // Let's assume we want to animate the *action*.
      // If currently Down (Compact) -> Click -> Animate Down Bounce -> Switch to Up.
      // If currently Up (Full) -> Click -> Animate Up Bounce -> Switch to Down.

      chevron.animateBounce();

      // Switch direction after short delay or immediately?
      // Animation is 600ms.
      // Let's swap direction halfway?
      setTimeout(() => {
        const nowCompact = document
          .getElementById("find-replace-bar")
          .classList.contains("compact");
        if (nowCompact) {
          chevron.setDirection("down"); // Now compact, show down (expand)
        } else {
          chevron.setDirection("up"); // Now expanded, show up (collapse)
        }
      }, 300);
    });
  }
};

// ========================================
// DIALOGS
// ========================================

/**
 * Close all open dropdown menus
 */
function closeAllMenus() {
  document.querySelectorAll(".menu-item.dropdown.open").forEach((el) => {
    el.classList.remove("open");
    el.setAttribute("aria-expanded", "false");
  });
}

/**
 * Show link or image insertion dialog
 * Show link or image insertion dialog
 * @param {string} type - 'link' or 'image'
 */
function openDialogElement(el) {
  if (!el) return;
  closeAllMenus();
  el.style.display = "block";
  void el.offsetWidth; // Force reflow
  el.classList.add("open");
}

function closeDialogElement(el) {
  if (!el) return;
  el.classList.remove("open");
  setTimeout(() => {
    if (!el.classList.contains("open")) {
      el.style.display = "none";
    }
  }, 250);
}

function showOverlay() {
  openDialogElement(document.getElementById("popup-overlay"));
}

function hideOverlay() {
  closeDialogElement(document.getElementById("popup-overlay"));
}

function showLinkImageDialog(type) {
  const dialog = document.getElementById("link-image-dialog");
  const overlay = document.getElementById("popup-overlay");
  const title = document.getElementById("dialog-title");
  const textLabel = document.getElementById("dialog-text-label");
  const urlInput = document.getElementById("dialog-url");
  const textInput = document.getElementById("dialog-text");
  const okBtn = document.getElementById("dialog-ok");
  const cancelBtn = document.getElementById("dialog-cancel");

  title.textContent = type === "link" ? "Insert Link" : "Insert Image";
  textLabel.textContent = type === "link" ? "Text" : "Alt Text";
  urlInput.value = "";
  textInput.value = editor.value.substring(
    editor.selectionStart,
    editor.selectionEnd,
  );

  showOverlay();
  openDialogElement(dialog);
  urlInput.focus();

  const handleOk = () => {
    const url = urlInput.value;
    const text = textInput.value;
    if (url) {
      const markdown =
        type === "link"
          ? `[${text || url}](${url})`
          : `![${text || "Image"}](${url})`;
      insertMarkdown(markdown, "");
    }
    closeDialog();
  };

  const handleCancel = () => {
    closeDialog();
  };

  const closeDialog = () => {
    hideOverlay();
    closeDialogElement(dialog);
    okBtn.onclick = null;
    cancelBtn.onclick = null;
    editor.focus();
  };

  okBtn.onclick = handleOk;
  cancelBtn.onclick = handleCancel;
}

/**
 * Show date/time insertion dialog
 */
function showDateTimeDialog() {
  const dialog = document.getElementById("date-time-dialog");
  const overlay = document.getElementById("popup-overlay");
  const insertBtn = document.getElementById("dt-insert");
  const cancelBtn = document.getElementById("dt-cancel");
  const radioButtons = document.getElementsByName("dt-type");
  const checkbox24h = document.getElementById("dt-24h");

  // Restore settings
  try {
    const storedType = localStorage.getItem("md-dt-type");
    const stored24h = localStorage.getItem("md-dt-24h");
    if (storedType) {
      for (const rb of radioButtons) {
        if (rb.value === storedType) rb.checked = true;
      }
    }
    if (stored24h !== null) {
      checkbox24h.checked = stored24h === "1";
    }
  } catch (e) { }

  showOverlay();
  openDialogElement(dialog);

  // Focus first radio
  radioButtons[0].focus();

  const handleInsert = () => {
    let type = "datetime";
    for (const rb of radioButtons) {
      if (rb.checked) type = rb.value;
    }
    const is24h = checkbox24h.checked;

    // Save settings
    try {
      localStorage.setItem("md-dt-type", type);
      localStorage.setItem("md-dt-24h", is24h ? "1" : "0");
    } catch (e) { }

    const now = new Date();
    let text = "";

    const pad = (n) => n.toString().padStart(2, "0");
    const year = now.getFullYear();
    const month = pad(now.getMonth() + 1);
    const day = pad(now.getDate());

    let hours = now.getHours();
    const minutes = pad(now.getMinutes());
    let ampm = "";

    if (!is24h) {
      ampm = hours >= 12 ? " PM" : " AM";
      hours = hours % 12;
      hours = hours ? hours : 12; // the hour '0' should be '12'
    }
    hours = pad(hours); // Pad hours as well? User usually expects 09:00 or 9:00. Let's pad for consistency.

    const dateStr = `${year}-${month}-${day}`;
    const timeStr = `${hours}:${minutes}${ampm}`;

    if (type === "datetime") {
      text = `${dateStr} ${timeStr}`;
    } else if (type === "date") {
      text = dateStr;
    } else if (type === "time") {
      text = timeStr;
    }

    insertMarkdown(text, "");
    closeDialog();
  };

  const handleCancel = () => {
    closeDialog();
  };

  const closeDialog = () => {
    hideOverlay();
    closeDialogElement(dialog);
    insertBtn.onclick = null;
    cancelBtn.onclick = null;
    editor.focus();
  };

  insertBtn.onclick = handleInsert;
  cancelBtn.onclick = handleCancel;
}

/**
 * Show Go To Line dialog
 */
function showGoToDialog() {
  const dialog = document.getElementById("goto-dialog");
  const overlay = document.getElementById("popup-overlay");
  const lineInput = document.getElementById("goto-line-input");
  const okBtn = document.getElementById("goto-ok");
  const cancelBtn = document.getElementById("goto-cancel");

  // Get total line count
  const totalLines = editor.value.split("\n").length;
  lineInput.max = totalLines;
  lineInput.value = "";

  showOverlay();
  openDialogElement(dialog);
  lineInput.focus();

  const handleGo = () => {
    const lineNumber = parseInt(lineInput.value, 10);
    if (lineNumber && lineNumber > 0 && lineNumber <= totalLines) {
      // Calculate position of the line
      const lines = editor.value.split("\n");
      let position = 0;
      for (let i = 0; i < lineNumber - 1; i++) {
        position += lines[i].length + 1; // +1 for newline
      }

      // Set cursor at the beginning of the line
      editor.selectionStart = position;
      editor.selectionEnd = position;
      editor.focus();

      // Scroll to the cursor position
      editor.blur();
      editor.focus();

      updateStatus(`Jumped to line ${lineNumber}`);
    }
    closeDialog();
  };

  const handleCancel = () => {
    closeDialog();
  };

  const closeDialog = () => {
    hideOverlay();
    closeDialogElement(dialog);
    okBtn.onclick = null;
    cancelBtn.onclick = null;
    lineInput.onkeydown = null;
    editor.focus();
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleGo();
    } else if (e.key === "Escape") {
      e.preventDefault();
      handleCancel();
    }
  };

  okBtn.onclick = handleGo;
  cancelBtn.onclick = handleCancel;
  lineInput.onkeydown = handleKeyDown;
}

/**
 * Show custom alert dialog
 * @param {string} message - Message to display
 * @param {Function} callback - Optional callback after close
 */
function customAlert(message, callback) {
  const alertBox = document.getElementById("custom-alert");
  const overlay = document.getElementById("popup-overlay");
  const msgEl = document.getElementById("custom-alert-message");
  const okBtn = document.getElementById("custom-alert-ok");

  msgEl.textContent = message;
  showOverlay();
  openDialogElement(alertBox);

  const closeAlert = () => {
    hideOverlay();
    closeDialogElement(alertBox);
    okBtn.onclick = null;
    if (callback) callback();
  };
  okBtn.onclick = closeAlert;
}

/**
 * Show About dialog
 */
function showAboutDialog() {
  const dialog = document.getElementById("about-dialog");
  const overlay = document.getElementById("popup-overlay");
  const closeBtn = document.getElementById("about-close");
  const buildNumberEl = document.getElementById("about-build-number");

  // Update build number from global variable
  if (typeof BUILD_NUMBER !== "undefined") {
    buildNumberEl.textContent = "Build " + BUILD_NUMBER;
  }

  showOverlay();
  openDialogElement(dialog);

  const closeDialog = () => {
    hideOverlay();
    closeDialogElement(dialog);
    closeBtn.onclick = null;
  };

  closeBtn.onclick = closeDialog;
}

/**
 * Show help popup
 */
function showHelp() {
  window.open("https://www.markdownguide.org/basic-syntax/", "_blank");
}

/**
 * Show about/changelog popup
 */
function showAbout() {
  window.open(
    "https://github.com/anhoa2007-coder/lancer-notes/releases/",
    "_blank",
  );
}

/**
 * Show edit menu (placeholder)
 */
function showEditMenu() {
  customAlert(
    "Edit menu - Use Ctrl+Z/Ctrl+Y for undo/redo, or the toolbar buttons.",
  );
}

/**
 * Show view menu (placeholder)
 */
function showViewMenu() {
  customAlert(
    "View menu - Use the view toggle buttons to switch between Editor, Preview, and Split view.",
  );
}

// ========================================
// VIEW & LAYOUT
// ========================================

/**
 * Set view mode (split, editor, or preview)
 * @param {string} mode - 'split', 'editor', or 'preview'
 */
function setViewMode(mode) {
  currentViewMode = mode;
  const container = document.getElementById("main-container");
  // Remove all view classes
  container.classList.remove("editor-only", "preview-only", "single-pane");

  // Remove 'active' from all view toggle buttons
  const btnSplit = document.getElementById("menu-view-split");
  const btnEditor = document.getElementById("menu-view-editor");
  const btnPreview = document.getElementById("menu-view-preview");

  if (btnSplit) btnSplit.classList.remove("active");
  if (btnEditor) btnEditor.classList.remove("active");
  if (btnPreview) btnPreview.classList.remove("active");

  // Always reset flex to 50/50 when switching to split view
  if (mode === "split") {
    document.getElementById("editor-pane").style.flex = "1";
    document.getElementById("preview-pane").style.flex = "1";
    if (btnSplit) btnSplit.classList.add("active");
  } else if (mode === "editor") {
    document.getElementById("editor-pane").style.flex = "";
    document.getElementById("preview-pane").style.flex = "";
    container.classList.add("editor-only", "single-pane");
    if (btnEditor) btnEditor.classList.add("active");
  } else if (mode === "preview") {
    document.getElementById("editor-pane").style.flex = "";
    document.getElementById("preview-pane").style.flex = "";
    container.classList.add("preview-only", "single-pane");
    if (btnPreview) btnPreview.classList.add("active");
  }
}

/**
 * Set up splitter drag functionality for resizing panes
 */
function setupSplitter() {
  const splitter = document.getElementById("splitter");
  let isResizing = false;

  // Mouse Events
  splitter.addEventListener("mousedown", function (e) {
    isResizing = true;
    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
    e.preventDefault();
  });

  // Touch Events
  splitter.addEventListener(
    "touchstart",
    function (e) {
      isResizing = true;
      document.addEventListener("touchmove", handleTouchMove, {
        passive: false,
      });
      document.addEventListener("touchend", handleTouchEnd);
      // Prevent scrolling while dragging
      if (e.cancelable) e.preventDefault();
    },
    { passive: false },
  );

  function handleMouseMove(e) {
    if (!isResizing) return;
    updateSplitterPosition(e.clientX);
  }

  function handleTouchMove(e) {
    if (!isResizing) return;
    // Use the first touch point
    if (e.touches && e.touches[0]) {
      updateSplitterPosition(e.touches[0].clientX);
      if (e.cancelable) e.preventDefault();
    }
  }

  function updateSplitterPosition(clientX) {
    const container = document.getElementById("main-container");
    const containerRect = container.getBoundingClientRect();
    const percentage =
      ((clientX - containerRect.left) / containerRect.width) * 100;

    if (percentage > 20 && percentage < 80) {
      document.getElementById("editor-pane").style.flex = `0 1 ${percentage}%`;
      document.getElementById("preview-pane").style.flex =
        `1 1 ${100 - percentage}%`;
    }
  }

  function handleMouseUp() {
    isResizing = false;
    document.removeEventListener("mousemove", handleMouseMove);
    document.removeEventListener("mouseup", handleMouseUp);
  }

  function handleTouchEnd() {
    isResizing = false;
    document.removeEventListener("touchmove", handleTouchMove);
    document.removeEventListener("touchend", handleTouchEnd);
  }
}

/**
 * Toggle status bar visibility
 */
function toggleStatusBar() {
  const statusBar = document.querySelector(".status-bar");
  const menuBtn = document.getElementById("menu-view-statusbar");

  if (statusBar) {
    if (statusBar.style.display === "none") {
      // Show it
      statusBar.style.display = "flex";
      // if (menuBtn) menuBtn.textContent = 'Hide Status Bar'; // Removed text toggle
      localStorage.setItem("markdown-show-statusbar", "1");
      updateMenuCheck("menu-view-statusbar", true);
    } else {
      // Hide it
      statusBar.style.display = "none";
      // if (menuBtn) menuBtn.textContent = 'Show Status Bar'; // Removed text toggle
      localStorage.setItem("markdown-show-statusbar", "0");
      updateMenuCheck("menu-view-statusbar", false);
    }
  }
}

/**
 * Toggle word wrap
 */
function toggleWordWrap() {
  const editor = document.getElementById("editor");
  const menuBtn = document.getElementById("menu-view-wordwrap");

  if (editor) {
    if (editor.classList.contains("no-wrap")) {
      editor.classList.remove("no-wrap");
      // if (menuBtn) menuBtn.textContent = 'Disable Word Wrap'; // Removed
      localStorage.removeItem("markdown-no-wrap");
      updateMenuCheck("menu-view-wordwrap", true);
    } else {
      editor.classList.add("no-wrap");
      // if (menuBtn) menuBtn.textContent = 'Enable Word Wrap'; // Removed
      localStorage.setItem("markdown-no-wrap", "1");
      updateMenuCheck("menu-view-wordwrap", false);
    }
  }
}

// ========================================
// SCROLL SYNCHRONIZATION (Anchor-Based)
// ========================================

let isScrollSyncEnabled = true; // Default
let scrollMap = null; // Cache
let isSyncingLeft = false;
let isSyncingRight = false;
let syncTimeoutLeft = null;
let syncTimeoutRight = null;
let buildMapTimeout = null;
let _scrollSyncObserver = null; // Track MutationObserver for cleanup
let _scrollSyncHandlers = null; // Track event handlers for cleanup

// Initialize scroll sync
function initScrollSync() {
  // Load preference
  const storedSync = localStorage.getItem("markdown-scroll-sync");
  if (storedSync === "0") {
    isScrollSyncEnabled = false;
  } else {
    isScrollSyncEnabled = true;
  }

  const editor = document.getElementById("editor");
  const preview = document.getElementById("preview");

  if (!editor || !preview) return;

  // Clean up previous initialization if any
  if (_scrollSyncObserver) {
    _scrollSyncObserver.disconnect();
    _scrollSyncObserver = null;
  }
  if (_scrollSyncHandlers) {
    editor.removeEventListener("scroll", _scrollSyncHandlers.editorScroll);
    preview.removeEventListener("scroll", _scrollSyncHandlers.previewScroll);
    editor.removeEventListener("input", _scrollSyncHandlers.editorInput);
    _scrollSyncHandlers = null;
  }

  // Create named handlers so they can be removed later
  const editorScrollHandler = () => {
    if (!isScrollSyncEnabled || isSyncingLeft) return;
    isSyncingRight = true;
    window.requestAnimationFrame(() => {
      syncPreview();
      clearTimeout(syncTimeoutRight);
      syncTimeoutRight = setTimeout(() => {
        isSyncingRight = false;
      }, 100);
    });
  };

  const previewScrollHandler = () => {
    if (!isScrollSyncEnabled || isSyncingRight) return;
    isSyncingLeft = true;
    window.requestAnimationFrame(() => {
      syncEditor();
      clearTimeout(syncTimeoutLeft);
      syncTimeoutLeft = setTimeout(() => {
        isSyncingLeft = false;
      }, 100);
    });
  };

  const editorInputHandler = () => {
    if (!isScrollSyncEnabled) return;
    clearTimeout(buildMapTimeout);
    buildMapTimeout = setTimeout(() => {
      buildScrollMap();
    }, 300);
  };

  // Store handler references for cleanup
  _scrollSyncHandlers = {
    editorScroll: editorScrollHandler,
    previewScroll: previewScrollHandler,
    editorInput: editorInputHandler,
  };

  // Attach event listeners
  editor.addEventListener("scroll", editorScrollHandler);
  preview.addEventListener("scroll", previewScrollHandler);
  editor.addEventListener("input", editorInputHandler);

  // Rebuild map when images load in preview
  _scrollSyncObserver = new MutationObserver((mutations) => {
    let shouldRebuild = false;
    for (const mutation of mutations) {
      if (
        mutation.type === "childList" ||
        (mutation.type === "attributes" && mutation.target.tagName === "IMG")
      ) {
        shouldRebuild = true;
        break;
      }
    }
    if (shouldRebuild) {
      clearTimeout(buildMapTimeout);
      buildMapTimeout = setTimeout(buildScrollMap, 300);
    }
  });
  _scrollSyncObserver.observe(preview, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ["src", "height"],
  });

  // Initial build
  setTimeout(buildScrollMap, 500);
}

// Toggle Scroll Sync
function toggleScrollSync() {
  isScrollSyncEnabled = !isScrollSyncEnabled;
  localStorage.setItem("markdown-scroll-sync", isScrollSyncEnabled ? "1" : "0");

  if (typeof updateMenuCheck === "function") {
    updateMenuCheck("menu-view-scrollsync", isScrollSyncEnabled);
  }

  if (isScrollSyncEnabled) {
    updateStatus("Scroll Sync Enabled");
    buildScrollMap();
    syncPreview(); // Initial sync
  } else {
    updateStatus("Scroll Sync Disabled");
  }
}

// Build the mapping between Editor lines and Preview elements (Anchor-Based)
function buildScrollMap() {
  const editor = document.getElementById("editor");
  const preview = document.getElementById("preview");
  if (!editor || !preview || !window.md) return;

  scrollMap = [];

  // Parse markdown to get tokens with line mapping
  // We use the same parser instance as rendering to ensure consistency
  const tokens = window.md.parse(editor.value, {});

  // Always add Start (Line 0 -> Top of Preview)
  scrollMap.push({ editorLine: 0, previewTop: 0 });

  // Find all headers that have a source line mapping
  // We look for 'heading_open' tokens which we modified to include in HTML
  // But here we just need the token's map
  tokens.forEach((token) => {
    if (token.type === "heading_open" && token.map) {
      const line = token.map[0];
      // Find the corresponding element in preview
      // We use the data attribute we injected during render
      const element = preview.querySelector(`[data-source-line="${line}"]`);
      if (element) {
        // We found a match!
        scrollMap.push({
          editorLine: line,
          previewTop: element.offsetTop,
        });
      }
    }
  });

  // Always add End (Last Line -> Bottom of Preview)
  // Use actual line count from editor value
  const lineCount = editor.value.split("\n").length;
  scrollMap.push({
    editorLine: lineCount,
    previewTop: preview.scrollHeight,
  });

  // Sort map just in case (though token order usually implies line order)
  scrollMap.sort((a, b) => a.editorLine - b.editorLine);
}

// Sync Preview based on Editor position
function syncPreview() {
  if (!scrollMap || scrollMap.length < 2) {
    buildScrollMap();
    if (!scrollMap || scrollMap.length < 2) return;
  }

  const editor = document.getElementById("editor");
  const previewContainer = document.getElementById("preview");

  // Calculate current line in editor
  // lineHeight is approx 24px usually. Let's try to get computed style.
  const computedStyle = window.getComputedStyle(editor);
  const lineHeight = parseFloat(computedStyle.lineHeight) || 24;

  const editorScrollTop = editor.scrollTop;
  const currentLine = editorScrollTop / lineHeight;

  // Find section in map
  let startNode = scrollMap[0];
  let endNode = scrollMap[1];
  let found = false;

  for (let i = 0; i < scrollMap.length - 1; i++) {
    if (
      currentLine >= scrollMap[i].editorLine &&
      currentLine < scrollMap[i + 1].editorLine
    ) {
      startNode = scrollMap[i];
      endNode = scrollMap[i + 1];
      found = true;
      break;
    }
  }

  if (!found) {
    startNode = scrollMap[scrollMap.length - 2];
    endNode = scrollMap[scrollMap.length - 1];
  }

  // Calculate percentage within section
  const lineSpan = endNode.editorLine - startNode.editorLine;
  let progress = 0;
  if (lineSpan > 0) {
    progress = (currentLine - startNode.editorLine) / lineSpan;
  }
  progress = Math.max(0, Math.min(1, progress)); // Clamp

  // Map to Preview
  const previewSpan = endNode.previewTop - startNode.previewTop;
  const targetScrollTop = startNode.previewTop + previewSpan * progress;

  previewContainer.scrollTop = targetScrollTop;
}

// Sync Editor based on Preview position
function syncEditor() {
  if (!scrollMap || scrollMap.length < 2) {
    buildScrollMap();
    if (!scrollMap || scrollMap.length < 2) return;
  }

  const editor = document.getElementById("editor");
  const previewContainer = document.getElementById("preview");
  const currentScrollTop = previewContainer.scrollTop;

  // Find section in map
  let startNode = scrollMap[0];
  let endNode = scrollMap[1];
  let found = false;

  for (let i = 0; i < scrollMap.length - 1; i++) {
    if (
      currentScrollTop >= scrollMap[i].previewTop &&
      currentScrollTop < scrollMap[i + 1].previewTop
    ) {
      startNode = scrollMap[i];
      endNode = scrollMap[i + 1];
      found = true;
      break;
    }
  }

  if (!found) {
    startNode = scrollMap[scrollMap.length - 2];
    endNode = scrollMap[scrollMap.length - 1];
  }

  // Calculate percentage
  const pixelSpan = endNode.previewTop - startNode.previewTop;
  let progress = 0;
  if (pixelSpan > 0) {
    progress = (currentScrollTop - startNode.previewTop) / pixelSpan;
  }
  progress = Math.max(0, Math.min(1, progress));

  // Map to Editor
  const computedStyle = window.getComputedStyle(editor);
  const lineHeight = parseFloat(computedStyle.lineHeight) || 24;

  const lineSpan = endNode.editorLine - startNode.editorLine;
  const targetLine = startNode.editorLine + lineSpan * progress;

  editor.scrollTop = targetLine * lineHeight;
}

// ========================================
// EXTERNAL SERVICES
// ========================================

/**
 * Search selected text with Google
 */
function searchWithGoogle() {
  const start = editor.selectionStart;
  const end = editor.selectionEnd;
  const selectedText = editor.value.substring(start, end);

  if (selectedText) {
    const query = encodeURIComponent(selectedText);
    const url = `https://www.google.com/search?q=${query}`;
    // Open safely
    const win = window.open(url, "_blank");
    if (win) win.focus();
  }
}

// ========================================
// ANIMATION UTILS
// ========================================

/**
 * Show checkmark animation on target element
 * @param {HTMLElement} target - Element to overlay animation on
 */
function showCheckAnimation(target) {
  if (!target) return;

  // Create container
  const container = document.createElement("div");
  container.className = "check-anim-container";

  // Position
  const rect = target.getBoundingClientRect();
  container.style.left = rect.left + "px";
  container.style.top = rect.top + "px";
  container.style.width = rect.width + "px";
  container.style.height = rect.height + "px";

  // Create SVG
  container.innerHTML = `
        <svg class="check-anim-svg" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
            <path class="check-anim-path" d="m4 12 5 5L20 6" />
        </svg>
    `;

  document.body.appendChild(container);

  // Trigger animation frame
  requestAnimationFrame(() => {
    container.classList.add("animate-check-start");
  });

  // Cleanup
  setTimeout(() => {
    if (container.parentNode) {
      container.parentNode.removeChild(container);
    }
  }, 1000);
}

/**
 * Select all text in the editor
 */
function selectAll() {
  editor.select();
  editor.focus();
}

// ========================================
// ANIMATION UTILS
// ========================================

/**
 * Update menu item checkmark state
 * @param {string} btnId - ID of the menu button
 * @param {boolean} isChecked - Whether it should be checked
 * @param {boolean} animate - Whether to animate (default true)
 */
function updateMenuCheck(btnId, isChecked, animate = true) {
  const btn = document.getElementById(btnId);
  if (!btn) return;

  // Remove existing check if any
  const existingIcon = btn.querySelector(".menu-check-icon");
  if (existingIcon) {
    if (!isChecked) {
      existingIcon.remove();
    }
    return;
  }

  if (isChecked) {
    // Create SVG
    const svgNS = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(svgNS, "svg");
    svg.setAttribute("class", "menu-check-icon");
    svg.setAttribute("viewBox", "0 0 24 24");

    const path = document.createElementNS(svgNS, "path");
    path.setAttribute("class", "menu-check-path");
    path.setAttribute("d", "m4 12 5 5L20 6");

    svg.appendChild(path);

    // Prepend to button
    btn.insertBefore(svg, btn.firstChild);

    if (animate) {
      // Trigger reflow
      void btn.offsetWidth;
      btn.classList.add("menu-check-active");
    } else {
      // Static visible state
      svg.style.opacity = "1";
      svg.style.transform = "scale(1)";
      path.style.strokeDashoffset = "0";
    }
  } else {
    btn.classList.remove("menu-check-active");
  }
}

/**
 * THEME MANAGEMENT
 * System, Light, Dark
 */

function initTheme() {
  // 1. Check for legacy 'markdown-dark-mode' if 'markdown-theme' doesn't exist
  if (!localStorage.getItem("markdown-theme")) {
    if (localStorage.getItem("markdown-dark-mode")) {
      localStorage.setItem("markdown-theme", "dark");
      localStorage.removeItem("markdown-dark-mode"); // Clean up
    } else {
      // Default to system if nothing set
      localStorage.setItem("markdown-theme", "system");
    }
  }

  const theme = localStorage.getItem("markdown-theme");
  setTheme(theme);

  // Listen for OS changes only if we are in system mode
  window
    .matchMedia("(prefers-color-scheme: dark)")
    .addEventListener("change", (e) => {
      if (localStorage.getItem("markdown-theme") === "system") {
        applyTheme(e.matches);
      }
    });
}

function setTheme(mode) {
  // mode: 'system', 'light', 'dark'
  localStorage.setItem("markdown-theme", mode);

  // Update UI checkmarks
  updateThemeMenuUI(mode);

  // Apply the theme
  if (mode === "system") {
    const isDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    applyTheme(isDark);
  } else if (mode === "dark") {
    applyTheme(true);
  } else {
    applyTheme(false);
  }
}

function applyTheme(isDark) {
  // dark-mode class lives on <html> so the inline <head> script can set it
  // before the body is painted — preventing the light-mode flash on load.

  if (isDark) {
    document.documentElement.classList.add("dark-mode");
    document.documentElement.style.colorScheme = "dark";
  } else {
    document.documentElement.classList.remove("dark-mode");
    document.documentElement.style.colorScheme = "light";
  }

  // Toggle highlight.js theme stylesheets
  const lightSheet = document.getElementById("hljs-theme-light");
  const darkSheet = document.getElementById("hljs-theme-dark");
  if (lightSheet && darkSheet) {
    lightSheet.disabled = isDark;
    darkSheet.disabled = !isDark;
  }
}

function updateThemeMenuUI(mode) {
  const ids = ["menu-theme-system", "menu-theme-light", "menu-theme-dark"];
  const modes = ["system", "light", "dark"];

  for (let i = 0; i < ids.length; i++) {
    updateMenuCheck(ids[i], modes[i] === mode);
  }
}

function toggleDarkMode() {
  // Legacy support or alias: just toggle between light/dark, ignoring system
  const current = localStorage.getItem("markdown-theme");
  if (current === "dark") {
    setTheme("light");
  } else {
    setTheme("dark");
  }
}

// Expose to window
window.setTheme = setTheme;
window.initTheme = initTheme;
window.toggleDarkMode = toggleDarkMode;

// ========================================
// FILE LOADED INDICATOR
// ========================================
// This marker indicates the file loaded successfully
window.MAIN_MD_FUNCTION_LOADED = true;
console.log("✓ function.js loaded successfully");
// Flag to indicate successful loading
window.MAIN_MD_FUNCTION_LOADED = true;
