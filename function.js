// ========================================
// MARKDOWN EDITOR - CORE FUNCTIONS
// function.js
// Build 5147
// ========================================
// This file contains all core markdown processing,
// formatting, and utility functions for the editor.
// Note: Global variables (editor, preview, currentFile, undoStack, redoStack, currentViewMode, BUILD_NUMBER, findState)
// are defined in the HTML file and referenced here.
// ========================================

// ========================================
// MARKDOWN PARSING
// ========================================

/**
 * Parse markdown text to HTML
 * @param {string} markdown - The markdown text to parse
 * @returns {string} - The parsed HTML
 */
function parseMarkdown(markdown) {
    let html = markdown;

    // Handle escaped characters first
    html = html.replace(/\\([\\`\*_{}[\]()#+\-.!|])/g, function (match, p1) { return '@@ESCAPED:' + p1.charCodeAt(0).toString(16) + '@@'; });

    // Blockquotes: support nested blockquotes using multiple > at line start
    function parseBlockquotes(text) {
        const lines = text.split(/\r?\n/);
        let result = [];
        let buffer = [];
        let lastLevel = 0;
        function flush(level) {
            if (buffer.length === 0) return;
            let content = buffer.join('\n');
            if (lastLevel > 0) {
                content = parseBlockquotes(content);
                for (let i = 0; i < lastLevel; i++) {
                    content = `<blockquote>${content}</blockquote>`;
                }
            }
            result.push(content);
            buffer = [];
        }
        for (let line of lines) {
            const match = line.match(/^(>+)( ?)(.*)$/);
            if (match) {
                const level = match[1].length;
                if (lastLevel !== 0 && level !== lastLevel) {
                    flush(lastLevel);
                }
                buffer.push(match[3]);
                lastLevel = level;
            } else {
                flush(lastLevel);
                result.push(line);
                lastLevel = 0;
            }
        }
        flush(lastLevel);
        return result.join('\n');
    }
    html = parseBlockquotes(html);

    // Original parsing logic continues here...
    html = html
        // Headers (H1-H6)
        .replace(/^###### (.*$)/gm, '<h6>$1</h6>')
        .replace(/^##### (.*$)/gm, '<h5>$1</h5>')
        .replace(/^#### (.*$)/gm, '<h4>$1</h4>')
        .replace(/^### (.*$)/gm, '<h3>$1</h3>')
        .replace(/^## (.*$)/gm, '<h2>$1</h2>')
        .replace(/^# (.*$)/gm, '<h1>$1</h1>')
        // Horizontal rules (---, ***, ___ on their own line)
        .replace(/^(?:---|\\*\\*\\*|___)\\s*$/gm, '<hr>')

        // Bold, italic, and strikethrough
        .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
        .replace(/\*(.*?)\*/g, '<em>$1</em>')
        .replace(/~~(.*?)~~/g, '<del>$1</del>')

        // Code blocks
        .replace(/```(\w+)?\n([\s\S]*?)```/g, (match, lang, code) => {
            const languageClass = lang ? `language-${lang}` : 'language-none';
            return `<pre><code class="${languageClass}">${code.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</code></pre>`;
        })
        .replace(/`([^`]+)`/g, '<code>$1</code>')

        // Links & Images
        .replace(/!\[([^\]]*)\]\(([^)]+?)(?:\s+"([^"]*)")?\)/g, function (match, alt, url, title) {
            let info = (alt && alt.trim()) || (title && title.trim());
            let imgTag = `<img src="${url}" alt="${alt || ''}"${title ? ` title="${title}"` : ''}>`;
            if (info) {
                return `<span class="md-img-info-wrap">${imgTag}<span class="md-img-info-badge" title="Image info">i</span></span>`;
            } else {
                return imgTag;
            }
        })
        .replace(/\[([^\]]+)\]\(([^)]+?)(?:\s+"([^"]*)")?\)/g, function (match, text, url, title) {
            const t = title ? ` title="${title}"` : '';
            return `<a href="${url}"${t}>${text}</a>`;
        })
        // Autolink bare URLs
        .replace(/(^|[^"'=])(https?:\/\/[\w\-._~:\/?#\[\]@!$&'()*+,;=%]+)/g, function (m, lead, url) {
            return `${lead}<a href="${url}">${url}</a>`;
        })
        // Autolink emails
        .replace(/(^|\s)([A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,})/g, function (m, lead, email) {
            return `${lead}<a href="mailto:${email}">${email}</a>`;
        });

    // Table processing
    // Look for lines that start with | and have a subsequent line of separators
    const tableRegex = /^\|(.+)\|\r?\n\|( *[-:]+[-| :]*)\|\r?\n((?:\|.*\|\r?\n?)*)/gm;

    html = html.replace(tableRegex, function (match, header, separator, body) {
        const headers = header.split('|').map(h => h.trim());
        const aligns = separator.split('|').map(s => {
            s = s.trim();
            if (s.startsWith(':') && s.endsWith(':')) return 'center';
            if (s.endsWith(':')) return 'right';
            return 'left';
        });

        const rows = body.trim().split(/\r?\n/);

        let tableHtml = '<table><thead><tr>';
        headers.forEach((h, i) => {
            const align = aligns[i] ? ` style="text-align: ${aligns[i]}"` : '';
            tableHtml += `<th${align}>${h}</th>`;
        });
        tableHtml += '</tr></thead><tbody>';

        rows.forEach(row => {
            // Remove leading/trailing pipes if present (regex matches usually keep inner ones, but let's be safe)
            row = row.replace(/^\||\|$/g, '');
            const cells = row.split('|');
            tableHtml += '<tr>';
            cells.forEach((cell, i) => {
                const align = aligns[i] ? ` style="text-align: ${aligns[i]}"` : '';
                // Recursively parse inline content inside cells
                tableHtml += `<td${align}>${cell.trim()}</td>`;
            });
            tableHtml += '</tr>';
        });

        tableHtml += '</tbody></table>';
        return tableHtml;
    });

    // List processing (Unordered and Ordered) - Supports nesting
    // We capture all list lines first, then process them recursively
    const listBlockRegex = /^(?:[ \t]*)(?:[\*\-\+]|\d+\.) (?:.*)(?:\r?\n(?:[ \t]*)(?:[\*\-\+]|\d+\.) (?:.*))*/gm;

    html = html.replace(listBlockRegex, function (match) {
        const lines = match.split(/\r?\n/);



        function processListRecursive(lines, baseIndent) {
            if (lines.length === 0) return '';

            let htmlOut = '';
            let currentType = null;
            let buffer = []; // items of the current list

            // Helper to flush buffer
            const flush = () => {
                if (buffer.length === 0) return;
                htmlOut += `<${currentType}>\n${buffer.join('\n')}\n</${currentType}>\n`;
                buffer = [];
                currentType = null;
            };



            // Re-implementing a simpler recursive strategy strictly based on indentation
            // Group lines by top-level items
            let items = [];
            let currentItem = null;

            for (let i = 0; i < lines.length; i++) {
                const line = lines[i];
                const indentMatch = line.match(/^(\s*)/);
                const currentIndent = indentMatch ? indentMatch[1].replace(/\t/g, '    ').length : 0;

                if (currentIndent === baseIndent) {
                    // This is a direct item of the current list list
                    if (currentItem) items.push(currentItem);

                    const isOrd = /^\s*\d+\./.test(line);
                    const type = isOrd ? 'ol' : 'ul';
                    const content = line.replace(/^\s*(?:[\*\-\+]|\d+\.)\s+/, '');

                    currentItem = {
                        type: type,
                        content: content,
                        childrenLines: []
                    };
                } else if (currentIndent > baseIndent) {
                    // This belongs to the current item's children
                    if (currentItem) {
                        currentItem.childrenLines.push(line);
                    } else {
                        // Orphaned high-indent line? Treat as text or ignore?
                        // For now, ignore or append to 'items' if we want robust recovery, but skipping is safer
                    }
                } else {
                    // Indent is LESS than base (shouldn't happen if we slice properly in recursion)
                }
            }
            if (currentItem) items.push(currentItem);

            // Render items
            if (items.length === 0) return '';

            // We might have mixed UL/OL at the same level? Standard markdown usually splits triggers, but let's assume grouping 
            // Group by type to support adjacent different list types
            let finalHtml = '';
            let listGroup = [];
            let lastType = null;

            const renderGroup = () => {
                if (listGroup.length === 0) return;
                finalHtml += `<${lastType}>`;
                listGroup.forEach(item => {
                    const childHtml = processListRecursive(item.childrenLines, baseIndent + 4); // Assume 4 spaces step
                    finalHtml += `<li>${item.content}${childHtml}</li>`;
                });
                finalHtml += `</${lastType}>`;
                listGroup = [];
            };

            items.forEach(item => {
                if (lastType && item.type !== lastType) {
                    renderGroup();
                }
                lastType = item.type;
                listGroup.push(item);
            });
            renderGroup();

            return finalHtml;
        }

        return processListRecursive(lines, 0); // Start at level 0
    });

    // Line breaks and paragraphs
    html = html.replace(/\n\n/g, '</p><p>')
        .replace(/\n/g, '<br>');

    // Wrap in paragraphs and fix lists
    html = '<p>' + html.trim() + '</p>';

    // Cleanup: Remove <p> tags that incorrectly wrap block elements like tables or hr
    html = html.replace(/<p>\s*(<(table|ul|ol|pre|blockquote|h[1-6]|hr))/g, '$1');
    html = html.replace(/(<\/(table|ul|ol|pre|blockquote|h[1-6])>|<hr>)\s*<\/p>/g, '$1');

    html = html.replace(/<\/p><p>(<li>.*?<\/li>)<\/p><p>/g, '<ul>$1</ul>');
    html = html.replace(/<\/li><br><li>/g, '</li><li>');

    // Fix empty paragraphs
    html = html.replace(/<p>\s*<\/p>/g, '');
    html = html.replace(/<p><br><\/p>/g, '');

    // Restore escaped characters
    html = html.replace(/@@ESCAPED:([0-9a-f]+)@@/gi, function (match, p1) { return String.fromCharCode(parseInt(p1, 16)); });

    return html;
}

/**
 * Escape HTML special characters
 * @param {string} s - String to escape
 * @returns {string} - Escaped string
 */
function escapeHtml(s) {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// ========================================
// UI UPDATE FUNCTIONS
// ========================================

/**
 * Update the preview pane with parsed markdown
 */
function updatePreview() {
    const markdownText = editor.value;
    const htmlContent = parseMarkdown(markdownText);
    preview.innerHTML = htmlContent;

    // Trigger Prism.js highlighting
    if (window.Prism) {
        Prism.highlightAllUnder(preview);
    }
}

/**
 * Update the status bar with current document stats
 */
function updateStatusBar() {
    const text = editor.value;
    const wordCount = text.trim() ? text.trim().split(/\s+/).length : 0;
    const charCount = text.length;
    const lineCount = text.split('\n').length;

    document.getElementById('word-count').textContent = `Words: ${wordCount}`;
    document.getElementById('char-count').textContent = `Characters: ${charCount}`;
    document.getElementById('line-count').textContent = `Lines: ${lineCount}`;
}

/**
 * Update status bar message (temporary)
 * @param {string} message - Message to display
 */
function updateStatus(message) {
    document.getElementById('status-left').textContent = message;
    setTimeout(() => {
        document.getElementById('status-left').textContent = 'Ready';
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
    editor.value = editor.value.substring(0, start) + newText + editor.value.substring(end);

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
    let lineStart = text.lastIndexOf('\n', start - 1) + 1;
    // Find end of the line where selection ends
    let lineEnd = text.indexOf('\n', end);
    if (lineEnd === -1) lineEnd = text.length;

    const currentLine = text.substring(lineStart, lineEnd);
    const match = currentLine.match(/^(#{1,6})\s/);

    let newLine = '';
    if (match) {
        // Existing heading
        const existingLevel = match[1].length;
        if (existingLevel === level) {
            // Toggle off if same level
            newLine = currentLine.substring(existingLevel + 1);
        } else {
            // Change level
            newLine = '#'.repeat(level) + ' ' + currentLine.substring(existingLevel + 1);
        }
    } else {
        // No existing heading - add one
        newLine = '#'.repeat(level) + ' ' + currentLine;
    }

    saveToUndoStack();
    editor.setRangeText(newLine, lineStart, lineEnd, 'end');

    editor.focus();
    updatePreview();
    updateStatusBar();

    // Update toolbar icon
    const icon = document.getElementById('current-heading-icon');
    if (icon) {
        icon.textContent = 'format_h' + level;
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
    let lineStart = text.lastIndexOf('\n', start - 1) + 1;
    let lineEnd = text.indexOf('\n', end);
    if (lineEnd === -1) lineEnd = text.length;

    // We only support single line or bulk toggle? Let's just do single line insert for now or upgrade to multiline
    // If multiline selection, apply to all lines
    const substring = text.substring(lineStart, lineEnd);
    const lines = substring.split('\n');
    let newSubstring = '';

    // Check if we are already a list of this type
    const isAlreadyList = new RegExp(`^\\s*${prefix === '- ' ? '[\\*\\-\\+]' : '\\d+\\.'}`).test(lines[0]);

    for (let i = 0; i < lines.length; i++) {
        if (isAlreadyList) {
            // Remove list formatting
            newSubstring += lines[i].replace(/^\s*(?:[\*\-\+]|\d+\.)\s+/, '') + (i < lines.length - 1 ? '\n' : '');
        } else {
            // Add list formatting
            newSubstring += prefix + lines[i] + (i < lines.length - 1 ? '\n' : '');
        }
    }

    saveToUndoStack();
    editor.setRangeText(newSubstring, lineStart, lineEnd, 'select');
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

    let lineStart = text.lastIndexOf('\n', start - 1) + 1;
    let lineEnd = text.indexOf('\n', end);
    if (lineEnd === -1) lineEnd = text.length;

    const selectedLines = text.substring(lineStart, lineEnd);
    const indented = selectedLines.replace(/^/gm, '    ');

    saveToUndoStack();
    editor.setRangeText(indented, lineStart, lineEnd, 'select');
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

    let lineStart = text.lastIndexOf('\n', start - 1) + 1;
    let lineEnd = text.indexOf('\n', end);
    if (lineEnd === -1) lineEnd = text.length;

    const selectedLines = text.substring(lineStart, lineEnd);
    // Remove up to 4 spaces or a tab
    const outdented = selectedLines.replace(/^(?:    |\t)/gm, '');

    saveToUndoStack();
    editor.setRangeText(outdented, lineStart, lineEnd, 'select');
    updatePreview();
    updateStatusBar();
}

/**
 * Launch link insertion dialog
 */
function insertLink() {
    showLinkImageDialog('link');
}

/**
 * Launch image insertion dialog
 */
function insertImage() {
    showLinkImageDialog('image');
}

/**
 * Insert table with specified dimensions
 * @param {number} cols - Number of columns
 * @param {number} rows - Number of rows
 */
function insertTable(cols = 2, rows = 2) {
    const start = editor.selectionStart;

    // Generate header row
    let tableTemplate = '|';
    for (let i = 1; i <= cols; i++) {
        tableTemplate += ` Header ${i} |`;
    }
    tableTemplate += '\n|';

    // Generate separator row
    for (let i = 0; i < cols; i++) {
        tableTemplate += ' -------- |';
    }
    tableTemplate += '\n';

    // Generate data rows
    for (let r = 1; r <= rows; r++) {
        tableTemplate += '|';
        for (let c = 1; c <= cols; c++) {
            tableTemplate += ` Cell ${r}-${c} |`;
        }
        tableTemplate += '\n';
    }

    // Ensure we start on a new line if not already
    const ls = editor.value.lastIndexOf('\n', start - 1) + 1;
    const prefix = (ls === start) ? '' : '\n\n';

    const snippet = prefix + tableTemplate;

    editor.setRangeText(snippet, start, editor.selectionEnd, 'end');
    editor.focus();
    updatePreview();
    updateStatusBar();
}

/**
 * Initialize table grid selector
 */
function initTableGrid() {
    const grid = document.getElementById('table-grid');
    const preview = document.getElementById('table-grid-preview');

    if (!grid || !preview) return;

    let selectedCols = 1;
    let selectedRows = 1;

    // Create 5x5 grid
    for (let row = 0; row < 5; row++) {
        for (let col = 0; col < 5; col++) {
            const cell = document.createElement('div');
            cell.className = 'table-grid-cell';
            cell.dataset.row = row + 1;
            cell.dataset.col = col + 1;

            cell.addEventListener('mouseenter', function () {
                const hoverRow = parseInt(this.dataset.row);
                const hoverCol = parseInt(this.dataset.col);

                // Update preview
                preview.textContent = `${hoverCol} x ${hoverRow}`;

                // Highlight cells
                document.querySelectorAll('.table-grid-cell').forEach(c => {
                    const cellRow = parseInt(c.dataset.row);
                    const cellCol = parseInt(c.dataset.col);

                    if (cellRow <= hoverRow && cellCol <= hoverCol) {
                        c.classList.add('active');
                    } else {
                        c.classList.remove('active');
                    }
                });
            });

            cell.addEventListener('click', function () {
                selectedRows = parseInt(this.dataset.row);
                selectedCols = parseInt(this.dataset.col);
                insertTable(selectedCols, selectedRows);
                closeAllMenus();
            });

            grid.appendChild(cell);
        }
    }

    // Reset on mouse leave
    grid.addEventListener('mouseleave', function () {
        preview.textContent = '1 x 1';
        document.querySelectorAll('.table-grid-cell').forEach(c => {
            c.classList.remove('active');
        });
    });
}

/**
 * Insert horizontal rule at cursor
 */
function insertHorizontalRule() {
    const start = editor.selectionStart;
    const ls = editor.value.lastIndexOf('\n', start - 1) + 1;
    const prefix = ls === start ? '' : '\n';
    const snippet = `${prefix}---\n`;
    editor.setRangeText(snippet, start, start, 'end');
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
        .replace(/(\*\*|__)(.*?)\1/g, '$2')
        // Remove italic (* or _)
        .replace(/(\*|_)(.*?)\1/g, '$2')
        // Remove strikes (~~)
        .replace(/~~(.*?)~~/g, '$1')
        // Remove inline code (`)
        .replace(/`([^`]+)`/g, '$1')
        // Remove links (keep text)
        .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
        // Remove images (keep alt text)
        .replace(/!\[([^\]]*)\]\([^)]+\)/g, '$1')
        // Remove headings
        .replace(/^#+\s+/gm, '')
        // Remove blockquotes
        .replace(/^>\s+/gm, '');

    editor.setRangeText(selectedText, start, end, 'select');
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
function newFile() {
    if (editor.value.trim() && !confirm('Are you sure you want to create a new file? Unsaved changes will be lost.')) {
        return;
    }
    editor.value = '';
    currentFile = null;
    updatePreview();
    updateStatusBar();
    updateStatus('New file created');
}

/**
 * Open file dialog
 */
function openFile() {
    document.getElementById('file-input').click();
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
function saveFile() {
    const content = editor.value;
    let filename = currentFile || 'document.md';
    // If the filename has no extension, default to .md
    if (!/\.(md|markdown|txt|text)$/i.test(filename)) {
        filename += '.md';
    }
    // Use text/plain for .txt/.text, text/markdown for .md
    let type = 'text/markdown';
    if (/\.(txt|text)$/i.test(filename)) {
        type = 'text/plain';
    }
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    updateStatus(`Saved: ${filename}`);
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
        editor.value = undoStack[undoStack.length - 1] || '';
        updatePreview();
        updateStatusBar();
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
}

// ========================================
// FIND & REPLACE
// ========================================

/**
 * Toggle find/replace bar visibility
 * @param {boolean} openReplace - Whether to open with replace field focused
 */
function toggleFindReplace(openReplace) {
    const bar = document.getElementById('find-replace-bar');
    const isVisible = bar.classList.contains('open');

    if (!isVisible) {
        // Open logic
        bar.style.display = 'block';
        // Force reflow
        void bar.offsetWidth;
        bar.classList.add('open');

        // Ensure centered position and accessibility attributes
        bar.setAttribute('aria-hidden', 'false');
        bar.setAttribute('aria-controls', 'editor');

        if (openReplace) {
            const replaceInput = document.getElementById('replace-input');
            if (replaceInput) replaceInput.focus();
            // Ensure expanded mode if opening replace specifically? 
            // The user didn't request auto-expand on replace click from menu, but it's good UX.
            // For now, respect current state or manual toggle.
        } else {
            document.getElementById('find-input').focus();
        }
        updateMatches(document.getElementById('find-input').value || '');
    } else {
        closeFindReplace();
    }
}

/**
 * Close find/replace bar with animation
 */
function closeFindReplace() {
    const bar = document.getElementById('find-replace-bar');
    if (!bar) return;

    bar.classList.remove('open');
    bar.setAttribute('aria-hidden', 'true');
    editor.focus();

    // Wait for transition to finish before hiding
    // We use a one-time event listener or a timeout matching CSS transition
    const cleanup = () => {
        if (!bar.classList.contains('open')) {
            bar.style.display = 'none';
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
    const cs = document.getElementById('case-sensitive') && document.getElementById('case-sensitive').checked;
    const useRegex = document.getElementById('use-regex') && document.getElementById('use-regex').checked;
    if (!query) { updateMatchCount(); return; }
    const text = editor.value;
    if (useRegex) {
        // build flags string from flag checkboxes
        let flags = 'g';
        if (!cs) flags += 'i';
        document.querySelectorAll('.flag-checkbox:checked').forEach(b => { const f = b.getAttribute('data-flag'); if (f && !flags.includes(f)) flags += f; });
        let re;
        try {
            re = new RegExp(query, flags);
        } catch (err) {
            const el = document.getElementById('match-count'); if (el) el.textContent = 'Invalid regex';
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
    if (!cs) { hay = text.toLowerCase(); needle = query.toLowerCase(); }
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
function highlightMatches() {
    try {
        const text = editor.value;
        const useRegex = document.getElementById('use-regex') && document.getElementById('use-regex').checked;
        const cs = document.getElementById('case-sensitive') && document.getElementById('case-sensitive').checked;
        const flagM = document.getElementById('flag-m') && document.getElementById('flag-m').checked;
        const flagS = document.getElementById('flag-s') && document.getElementById('flag-s').checked;
        const flagY = document.getElementById('flag-y') && document.getElementById('flag-y').checked;
        const q = document.getElementById('find-input').value;
        if (!q) { updatePreview(); return; }
        // Build regex or literal
        let re;
        if (useRegex) {
            // build flags from flag checkboxes
            let flags = 'g'; if (!cs) flags += 'i';
            document.querySelectorAll('.flag-checkbox:checked').forEach(b => { const f = b.getAttribute('data-flag'); if (f && !flags.includes(f)) flags += f; });
            try { re = new RegExp(q, flags); } catch (err) { const el = document.getElementById('match-count'); if (el) el.textContent = 'Invalid regex'; return; }
        } else {
            const esc = q.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&');
            let flags = 'g'; if (!cs) flags += 'i'; if (flagM) flags += 'm'; if (flagS) flags += 's'; if (flagY) flags += 'y';
            // also include other checked flags
            document.querySelectorAll('.flag-checkbox:checked').forEach(b => { const f = b.getAttribute('data-flag'); if (f && !flags.includes(f)) flags += f; });
            re = new RegExp(esc, flags);
        }

        // Use preview HTML from markdown, but we will operate on text only: highlight in preview by work-around — simple replace on escaped text
        const escaped = escapeHtml(text);
        let idx = 0; let out = ''; let m; let lastEnd = 0; let matchIndex = 0;
        while ((m = re.exec(text)) !== null) {
            const start = m.index; const end = m.index + m[0].length;
            out += escapeHtml(text.substring(lastEnd, start));
            const cls = (findState.currentIndex === matchIndex) ? 'md-match-current find-transition' : 'md-match find-transition';
            out += `<span class="${cls}">` + escapeHtml(m[0]) + `</span>`;
            lastEnd = end;
            matchIndex++;
            if (m.index === re.lastIndex) re.lastIndex++; // avoid zero-length match infinite loop
        }
        out += escapeHtml(text.substring(lastEnd));
        // Convert newlines to <br> to mimic preview
        out = out.replace(/\n/g, '<br>');
        preview.innerHTML = out;
    } catch (err) {
        // on error, fallback to normal preview
        updatePreview();
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
    const el = document.getElementById('match-count');
    const total = findState.matches.length;
    const current = (findState.currentIndex >= 0 && total > 0) ? (findState.currentIndex + 1) : 0;
    if (el) el.textContent = `${current} / ${total}`;
}

/**
 * Find next match
 */
function findNext() {
    const q = document.getElementById('find-input').value;
    if (q !== findState.lastQuery) {
        findState.lastQuery = q;
        updateMatches(q);
    }
    if (findState.matches.length === 0) return;

    // Save history
    addToFindHistory(q);

    const wrap = document.getElementById('wrap-around') && document.getElementById('wrap-around').checked;
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
    const q = document.getElementById('find-input').value;
    if (q !== findState.lastQuery) {
        findState.lastQuery = q;
        updateMatches(q);
    }
    if (findState.matches.length === 0) return;

    const wrap = document.getElementById('wrap-around') && document.getElementById('wrap-around').checked;
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
    const q = document.getElementById('find-input').value;
    const r = document.getElementById('replace-input').value;
    if (!q) return;
    // If regex mode, use regex replace semantics
    const cs = document.getElementById('case-sensitive') && document.getElementById('case-sensitive').checked;
    const useRegex = document.getElementById('use-regex') && document.getElementById('use-regex').checked;
    if (useRegex) {
        try {
            const flags = cs ? '' : 'i';
            const re = new RegExp(q, flags);
            const selected = editor.value.substring(editor.selectionStart, editor.selectionEnd);
            if (selected && re.test(selected)) {
                saveToUndoStack();
                const replaced = selected.replace(re, r);
                editor.setRangeText(replaced, editor.selectionStart, editor.selectionEnd, 'end');
                updatePreview(); updateStatusBar(); updateMatches(q); return;
            }
            findNext();
            const sel = editor.value.substring(editor.selectionStart, editor.selectionEnd);
            if (sel && re.test(sel)) {
                saveToUndoStack();
                const replaced2 = sel.replace(re, r);
                editor.setRangeText(replaced2, editor.selectionStart, editor.selectionEnd, 'end');
                updatePreview(); updateStatusBar(); updateMatches(q);
            }
        } catch (err) {
            const el = document.getElementById('match-count'); if (el) el.textContent = 'Invalid regex';
        }
        return;
    }
    // plain substring replace
    const selected = editor.value.substring(editor.selectionStart, editor.selectionEnd);
    const matchesSelected = selected && ((cs && selected === q) || (!cs && selected.toLowerCase() === q.toLowerCase()));
    if (matchesSelected) {
        saveToUndoStack();
        addToFindHistory(q);
        addToReplaceHistory(r);
        editor.setRangeText(r, editor.selectionStart, editor.selectionEnd, 'end');
        updatePreview();
        updateStatusBar();
        updateMatches(q);
    } else {
        findNext();
        const sel = editor.value.substring(editor.selectionStart, editor.selectionEnd);
        const selMatches = sel && ((cs && sel === q) || (!cs && sel.toLowerCase() === q.toLowerCase()));
        if (selMatches) {
            saveToUndoStack();
            addToFindHistory(q);
            addToReplaceHistory(r);
            editor.setRangeText(r, editor.selectionStart, editor.selectionEnd, 'end');
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
    const q = document.getElementById('find-input').value;
    const r = document.getElementById('replace-input').value;
    if (!q) return;
    const cs = document.getElementById('case-sensitive') && document.getElementById('case-sensitive').checked;
    const useRegex = document.getElementById('use-regex') && document.getElementById('use-regex').checked;
    const text = editor.value;
    if (useRegex) {
        let flags = 'g'; if (!cs) flags += 'i';
        // include any checked flag checkboxes
        document.querySelectorAll('.flag-checkbox:checked').forEach(b => { const f = b.getAttribute('data-flag'); if (f && !flags.includes(f)) flags += f; });
        try {
            const re = new RegExp(q, flags);
            if (!re.test(text)) return;
            saveToUndoStack();
            addToFindHistory(q);
            addToReplaceHistory(r);
            editor.value = text.replace(re, r);
            updatePreview(); updateStatusBar(); updateMatches(q);
        } catch (err) {
            const el = document.getElementById('match-count'); if (el) el.textContent = 'Invalid regex';
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
        let result = '';
        let idx = 0;
        while (idx < text.length) {
            const segment = text.substring(idx);
            const pos = segment.toLowerCase().indexOf(needle);
            if (pos === -1) { result += segment; break; }
            result += segment.substring(0, pos) + r;
            idx += pos + q.length;
        }
        editor.value = result;
    }
    updatePreview(); updateStatusBar(); updateMatches(q);
}

// ========================================
// HISTORY SUGGESTIONS
// ========================================

const MAX_HISTORY = 10;
let findHistory = [];
let replaceHistory = [];

try {
    findHistory = JSON.parse(localStorage.getItem('md-find-history-v2') || '[]');
    replaceHistory = JSON.parse(localStorage.getItem('md-replace-history-v2') || '[]');
} catch (e) { }

function addToFindHistory(term) {
    if (!term || term.trim() === '') return;
    // Remove if exists to move to top
    findHistory = findHistory.filter(h => h !== term);
    findHistory.unshift(term);
    if (findHistory.length > MAX_HISTORY) findHistory.pop();
    try { localStorage.setItem('md-find-history-v2', JSON.stringify(findHistory)); } catch (e) { }
}

function addToReplaceHistory(term) {
    if (!term) return; // Allow empty string for replace? Maybe, but usually not useful for history. Let's allow non-empty.
    if (term.trim() === '') return;
    replaceHistory = replaceHistory.filter(h => h !== term);
    replaceHistory.unshift(term);
    if (replaceHistory.length > MAX_HISTORY) replaceHistory.pop();
    try { localStorage.setItem('md-replace-history-v2', JSON.stringify(replaceHistory)); } catch (e) { }
}

function setupFindReplaceHistory() {
    setupHistoryInput('find-input', 'find-history', () => findHistory, (val) => {
        document.getElementById('find-input').value = val;
        updateMatches(val);
    });
    setupHistoryInput('replace-input', 'replace-history', () => replaceHistory, (val) => {
        document.getElementById('replace-input').value = val;
    });
}

function setupHistoryInput(inputId, dropdownId, getHistoryFn, onSelect) {
    const input = document.getElementById(inputId);
    const dropdown = document.getElementById(dropdownId);
    if (!input || !dropdown) return;

    function showSuggestions(filterText) {
        const history = getHistoryFn();
        const filtered = filterText
            ? history.filter(h => h.toLowerCase().includes(filterText.toLowerCase()))
            : history;

        dropdown.innerHTML = '';
        if (filtered.length === 0) {
            dropdown.classList.remove('open');
            return;
        }

        filtered.forEach(item => {
            const div = document.createElement('div');
            div.className = 'history-item';
            // Highlight match
            if (filterText) {
                const idx = item.toLowerCase().indexOf(filterText.toLowerCase());
                if (idx >= 0) {
                    div.innerHTML = escapeHtml(item.substring(0, idx)) +
                        '<span class="match-highlight">' + escapeHtml(item.substring(idx, idx + filterText.length)) + '</span>' +
                        escapeHtml(item.substring(idx + filterText.length));
                } else {
                    div.textContent = item;
                }
            } else {
                div.textContent = item;
            }

            div.addEventListener('mousedown', (e) => { // mousedown happens before blur
                e.preventDefault(); // prevent blur
                onSelect(item);
                dropdown.classList.remove('open');
            });
            dropdown.appendChild(div);
        });
        dropdown.classList.add('open');
    }

    input.addEventListener('input', () => showSuggestions(input.value));
    input.addEventListener('focus', () => showSuggestions(input.value));
    input.addEventListener('blur', () => {
        setTimeout(() => dropdown.classList.remove('open'), 150);
    });
    input.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') dropdown.classList.remove('open');
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
            case 'n':
                e.preventDefault();
                newFile();
                break;
            case 'o':
                e.preventDefault();
                openFile();
                break;
            case 's':
                e.preventDefault();
                saveFile();
                break;
            case 'z':
                e.preventDefault();
                if (e.shiftKey) {
                    redo();
                } else {
                    undo();
                }
                break;
            case 'b':
                e.preventDefault();
                insertMarkdown('**', '**');
                break;
            case 'i':
                e.preventDefault();
                insertMarkdown('*', '*');
                break;
            case 'f':
                e.preventDefault();
                toggleFindReplace();
                break;
            case 'h':
                e.preventDefault();
                toggleFindReplace();
                document.getElementById('replace-input').focus();
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
                value = keyframes[0] + (keyframes[1] - keyframes[0]) * easeInOut(localP);
            } else {
                // 0.5 to 1.0 -> keyframe 1 to 2
                const localP = (progress - 0.5) * 2;
                value = keyframes[1] + (keyframes[2] - keyframes[1]) * easeInOut(localP);
            }
        } else if (keyframes.length === 2) {
            value = keyframes[0] + (keyframes[1] - keyframes[0]) * easeInOut(progress);
        }

        element.setAttribute(attr, value);

        if (progress < 1) {
            requestAnimationFrame(update);
        }
    }
    requestAnimationFrame(update);
}

function easeInOut(t) {
    return t < .5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
}

/**
 * createSlidersHorizontalIcon
 * @param {HTMLElement} container 
 */
function createSlidersHorizontalIcon(container) {
    if (!container) return;
    container.innerHTML = '';
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
        { x1: 3, y1: 5, x2: 10, y2: 5, id: 'line1', animate: { x2: [10, 4, 10] } },
        { x1: 14, y1: 3, x2: 14, y2: 7, id: 'line2', animate: { x1: [14, 8, 14], x2: [14, 8, 14] } },
        { x1: 14, y1: 5, x2: 21, y2: 5, id: 'line3', animate: { x1: [14, 8, 14] } },
        { x1: 3, y1: 12, x2: 8, y2: 12, id: 'line4', animate: { x2: [8, 16, 8] } },
        { x1: 8, y1: 10, x2: 8, y2: 14, id: 'line5', animate: { x1: [8, 16, 8], x2: [8, 16, 8] } },
        { x1: 12, y1: 12, x2: 21, y2: 12, id: 'line6', animate: { x1: [12, 20, 12] } },
        { x1: 3, y1: 19, x2: 12, y2: 19, id: 'line7', animate: { x2: [12, 7, 12] } },
        { x1: 16, y1: 17, x2: 16, y2: 21, id: 'line8', animate: { x1: [16, 11, 16], x2: [16, 11, 16] } },
        { x1: 16, y1: 19, x2: 21, y2: 19, id: 'line9', animate: { x1: [16, 11, 16] } }
    ];

    const lines = {};
    linesConfig.forEach(cfg => {
        const line = document.createElementNS(ns, "line");
        ["x1", "y1", "x2", "y2"].forEach(attr => line.setAttribute(attr, cfg[attr]));
        svg.appendChild(line);
        lines[cfg.id] = { el: line, config: cfg };
    });
    container.appendChild(svg);

    container.addEventListener('click', () => {
        linesConfig.forEach(cfg => {
            const el = lines[cfg.id].el;
            if (cfg.animate.x1) animateSvgAttribute(el, 'x1', cfg.animate.x1, 800);
            if (cfg.animate.x2) animateSvgAttribute(el, 'x2', cfg.animate.x2, 800);
            if (cfg.animate.y1) animateSvgAttribute(el, 'y1', cfg.animate.y1, 800);
        });
    });
}

/**
 * createChevronIcon
 * @param {HTMLElement} container 
 */
function createChevronIcon(container) {
    if (!container) return null;
    container.innerHTML = '';
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
            isUp = direction === 'up';
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
                ? [{ transform: 'translateY(0)' }, { transform: 'translateY(-4px)' }, { transform: 'translateY(0)' }]
                : [{ transform: 'translateY(0)' }, { transform: 'translateY(4px)' }, { transform: 'translateY(0)' }];

            path.animate(keyframes, {
                duration: 600,
                easing: 'ease-in-out'
            });
        }
    };

    return api;
}

// Global hook for icon creation to be called from HTML
window.initAnimatedIcons = function () {
    createSlidersHorizontalIcon(document.getElementById('fr-flag-btn'));

    const toggleBtn = document.getElementById('fr-compact-toggle');
    if (toggleBtn) {
        const chevron = createChevronIcon(toggleBtn);
        // We need to sync with initial state.
        // Check local storage or existing class
        const bar = document.getElementById('find-replace-bar');
        const isCompact = bar ? bar.classList.contains('compact') : false;

        // Compact mode -> We see 1 row. Button should Expand. Icon: ChevronDown.
        // Expanded mode -> We see 2 rows. Button should Collapse. Icon: ChevronUp.
        if (isCompact) {
            chevron.setDirection('down');
        } else {
            chevron.setDirection('up');
        }

        // Add click listener to animate
        // Note: The actual toggling logic is in markdown_editor.html's event listener.
        // We can add another listener here just for animation/icon update.
        toggleBtn.addEventListener('click', () => {
            // The state toggles after this click.
            // Current state (before toggle logic runs or concurrent):
            const willBeCompact = !document.getElementById('find-replace-bar').classList.contains('compact');
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
                const nowCompact = document.getElementById('find-replace-bar').classList.contains('compact');
                if (nowCompact) {
                    chevron.setDirection('down'); // Now compact, show down (expand)
                } else {
                    chevron.setDirection('up'); // Now expanded, show up (collapse)
                }
            }, 300);
        });
    }
};


// ========================================
// DIALOGS
// ========================================

/**
 * Show link or image insertion dialog
 * Show link or image insertion dialog
 * @param {string} type - 'link' or 'image'
 */
function openDialogElement(el) {
    if (!el) return;
    el.style.display = 'block';
    void el.offsetWidth; // Force reflow
    el.classList.add('open');
}

function closeDialogElement(el) {
    if (!el) return;
    el.classList.remove('open');
    setTimeout(() => {
        if (!el.classList.contains('open')) {
            el.style.display = 'none';
        }
    }, 250);
}

function showOverlay() {
    openDialogElement(document.getElementById('popup-overlay'));
}

function hideOverlay() {
    closeDialogElement(document.getElementById('popup-overlay'));
}

function showLinkImageDialog(type) {
    const dialog = document.getElementById('link-image-dialog');
    const overlay = document.getElementById('popup-overlay');
    const title = document.getElementById('dialog-title');
    const textLabel = document.getElementById('dialog-text-label');
    const urlInput = document.getElementById('dialog-url');
    const textInput = document.getElementById('dialog-text');
    const okBtn = document.getElementById('dialog-ok');
    const cancelBtn = document.getElementById('dialog-cancel');

    title.textContent = type === 'link' ? 'Insert Link' : 'Insert Image';
    textLabel.textContent = type === 'link' ? 'Text' : 'Alt Text';
    urlInput.value = '';
    textInput.value = editor.value.substring(editor.selectionStart, editor.selectionEnd);

    showOverlay();
    openDialogElement(dialog);
    urlInput.focus();

    const handleOk = () => {
        const url = urlInput.value;
        const text = textInput.value;
        if (url) {
            const markdown = type === 'link' ? `[${text || url}](${url})` : `![${text || 'Image'}](${url})`;
            insertMarkdown(markdown, '');
        }
        closeDialog();
    };

    const handleCancel = () => {
        closeDialog();
    };

    const closeDialog = () => {
        hideOverlay();
        closeDialogElement(dialog);
        okBtn.removeEventListener('click', handleOk);
        cancelBtn.removeEventListener('click', handleCancel);
        editor.focus();
    };

    okBtn.addEventListener('click', handleOk);
    cancelBtn.addEventListener('click', handleCancel);
}

/**
 * Show date/time insertion dialog
 */
function showDateTimeDialog() {
    const dialog = document.getElementById('date-time-dialog');
    const overlay = document.getElementById('popup-overlay');
    const insertBtn = document.getElementById('dt-insert');
    const cancelBtn = document.getElementById('dt-cancel');
    const radioButtons = document.getElementsByName('dt-type');
    const checkbox24h = document.getElementById('dt-24h');

    // Restore settings
    try {
        const storedType = localStorage.getItem('md-dt-type');
        const stored24h = localStorage.getItem('md-dt-24h');
        if (storedType) {
            for (const rb of radioButtons) {
                if (rb.value === storedType) rb.checked = true;
            }
        }
        if (stored24h !== null) {
            checkbox24h.checked = stored24h === '1';
        }
    } catch (e) { }

    showOverlay();
    openDialogElement(dialog);

    // Focus first radio
    radioButtons[0].focus();

    const handleInsert = () => {
        let type = 'datetime';
        for (const rb of radioButtons) {
            if (rb.checked) type = rb.value;
        }
        const is24h = checkbox24h.checked;

        // Save settings
        try {
            localStorage.setItem('md-dt-type', type);
            localStorage.setItem('md-dt-24h', is24h ? '1' : '0');
        } catch (e) { }

        const now = new Date();
        let text = '';

        const pad = (n) => n.toString().padStart(2, '0');
        const year = now.getFullYear();
        const month = pad(now.getMonth() + 1);
        const day = pad(now.getDate());

        let hours = now.getHours();
        const minutes = pad(now.getMinutes());
        let ampm = '';

        if (!is24h) {
            ampm = hours >= 12 ? ' PM' : ' AM';
            hours = hours % 12;
            hours = hours ? hours : 12; // the hour '0' should be '12'
        }
        hours = pad(hours); // Pad hours as well? User usually expects 09:00 or 9:00. Let's pad for consistency.

        const dateStr = `${year}-${month}-${day}`;
        const timeStr = `${hours}:${minutes}${ampm}`;

        if (type === 'datetime') {
            text = `${dateStr} ${timeStr}`;
        } else if (type === 'date') {
            text = dateStr;
        } else if (type === 'time') {
            text = timeStr;
        }

        insertMarkdown(text, '');
        closeDialog();
    };

    const handleCancel = () => {
        closeDialog();
    };

    const closeDialog = () => {
        hideOverlay();
        closeDialogElement(dialog);
        insertBtn.removeEventListener('click', handleInsert);
        cancelBtn.removeEventListener('click', handleCancel);
        editor.focus();
    };

    insertBtn.addEventListener('click', handleInsert);
    cancelBtn.addEventListener('click', handleCancel);
}

/**
 * Show Go To Line dialog
 */
function showGoToDialog() {
    const dialog = document.getElementById('goto-dialog');
    const overlay = document.getElementById('popup-overlay');
    const lineInput = document.getElementById('goto-line-input');
    const okBtn = document.getElementById('goto-ok');
    const cancelBtn = document.getElementById('goto-cancel');

    // Get total line count
    const totalLines = editor.value.split('\n').length;
    lineInput.max = totalLines;
    lineInput.value = '';

    showOverlay();
    openDialogElement(dialog);
    lineInput.focus();

    const handleGo = () => {
        const lineNumber = parseInt(lineInput.value, 10);
        if (lineNumber && lineNumber > 0 && lineNumber <= totalLines) {
            // Calculate position of the line
            const lines = editor.value.split('\n');
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
        okBtn.removeEventListener('click', handleGo);
        cancelBtn.removeEventListener('click', handleCancel);
        lineInput.removeEventListener('keydown', handleKeyDown);
        editor.focus();
    };

    const handleKeyDown = (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            handleGo();
        } else if (e.key === 'Escape') {
            e.preventDefault();
            handleCancel();
        }
    };

    okBtn.addEventListener('click', handleGo);
    cancelBtn.addEventListener('click', handleCancel);
    lineInput.addEventListener('keydown', handleKeyDown);
}

/**
 * Show custom alert dialog
 * @param {string} message - Message to display
 * @param {Function} callback - Optional callback after close
 */
function customAlert(message, callback) {
    const alertBox = document.getElementById('custom-alert');
    const overlay = document.getElementById('popup-overlay');
    const msgEl = document.getElementById('custom-alert-message');
    const okBtn = document.getElementById('custom-alert-ok');

    msgEl.textContent = message;
    showOverlay();
    openDialogElement(alertBox);

    const closeAlert = () => {
        hideOverlay();
        closeDialogElement(alertBox);
        okBtn.removeEventListener('click', closeAlert);
        if (callback) callback();
    };
    okBtn.addEventListener('click', closeAlert);
}

/**
 * Show About dialog
 */
function showAboutDialog() {
    const dialog = document.getElementById('about-dialog');
    const overlay = document.getElementById('popup-overlay');
    const closeBtn = document.getElementById('about-close');
    const buildNumberEl = document.getElementById('about-build-number');

    // Update build number from global variable
    if (typeof BUILD_NUMBER !== 'undefined') {
        buildNumberEl.textContent = 'Build ' + BUILD_NUMBER;
    }

    showOverlay();
    openDialogElement(dialog);

    const closeDialog = () => {
        hideOverlay();
        closeDialogElement(dialog);
        closeBtn.removeEventListener('click', closeDialog);
    };

    closeBtn.addEventListener('click', closeDialog);
}


/**
 * Show help popup
 */
function showHelp() {
    window.open('https://www.markdownguide.org/basic-syntax/', '_blank');
}

/**
 * Show about/changelog popup
 */
function showAbout() {
    window.open('https://objectpresents.github.io/lancer-notes/', '_blank');
}

/**
 * Show edit menu (placeholder)
 */
function showEditMenu() {
    customAlert('Edit menu - Use Ctrl+Z/Ctrl+Y for undo/redo, or the toolbar buttons.');
}

/**
 * Show view menu (placeholder)
 */
function showViewMenu() {
    customAlert('View menu - Use the view toggle buttons to switch between Editor, Preview, and Split view.');
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
    const container = document.getElementById('main-container');
    // Remove all view classes
    container.classList.remove('editor-only', 'preview-only', 'single-pane');

    // Remove 'active' from all view toggle buttons
    document.getElementById('split-btn').classList.remove('active');
    document.getElementById('editor-btn').classList.remove('active');
    document.getElementById('preview-btn').classList.remove('active');

    // Always reset flex to 50/50 when switching to split view
    if (mode === 'split') {
        document.getElementById('editor-pane').style.flex = '1';
        document.getElementById('preview-pane').style.flex = '1';
        document.getElementById('split-btn').classList.add('active');
        // showCheckAnimation(btn); // Remove old anim
    } else if (mode === 'editor') {
        document.getElementById('editor-pane').style.flex = '';
        document.getElementById('preview-pane').style.flex = '';
        container.classList.add('editor-only', 'single-pane');
        document.getElementById('editor-btn').classList.add('active');
        // showCheckAnimation(btn); // Remove old anim
    } else if (mode === 'preview') {
        document.getElementById('editor-pane').style.flex = '';
        document.getElementById('preview-pane').style.flex = '';
        container.classList.add('preview-only', 'single-pane');
        document.getElementById('preview-btn').classList.add('active');
        // showCheckAnimation(btn); // Remove old anim
    }
}

/**
 * Set up splitter drag functionality for resizing panes
 */
function setupSplitter() {
    const splitter = document.getElementById('splitter');
    let isResizing = false;

    splitter.addEventListener('mousedown', function (e) {
        isResizing = true;
        document.addEventListener('mousemove', handleMouseMove);
        document.addEventListener('mouseup', handleMouseUp);
        e.preventDefault();
    });

    function handleMouseMove(e) {
        if (!isResizing) return;

        const container = document.getElementById('main-container');
        const containerRect = container.getBoundingClientRect();
        const percentage = ((e.clientX - containerRect.left) / containerRect.width) * 100;

        if (percentage > 20 && percentage < 80) {
            document.getElementById('editor-pane').style.flex = `0 1 ${percentage}%`;
            document.getElementById('preview-pane').style.flex = `1 1 ${100 - percentage}%`;
        }
    }

    function handleMouseUp() {
        isResizing = false;
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
    }
}

/**
 * Toggle dark mode
 */
function toggleDarkMode() {
    document.body.classList.toggle('dark-mode');
    // Optionally persist mode
    if (document.body.classList.contains('dark-mode')) {
        localStorage.setItem('markdown-dark-mode', '1');
        updateMenuCheck('menu-view-darkmode', true);
        // Force browser to render in dark mode
        document.documentElement.style.colorScheme = 'dark';
    } else {
        localStorage.removeItem('markdown-dark-mode');
        updateMenuCheck('menu-view-darkmode', false);
        // Force browser to render in light mode
        document.documentElement.style.colorScheme = 'light';
    }
}

/**
 * Toggle status bar visibility
 */
function toggleStatusBar() {
    const statusBar = document.querySelector('.status-bar');
    const menuBtn = document.getElementById('menu-view-statusbar');

    if (statusBar) {
        if (statusBar.style.display === 'none') {
            // Show it
            statusBar.style.display = 'flex';
            // if (menuBtn) menuBtn.textContent = 'Hide Status Bar'; // Removed text toggle
            localStorage.setItem('markdown-show-statusbar', '1');
            updateMenuCheck('menu-view-statusbar', true);
        } else {
            // Hide it
            statusBar.style.display = 'none';
            // if (menuBtn) menuBtn.textContent = 'Show Status Bar'; // Removed text toggle
            localStorage.setItem('markdown-show-statusbar', '0');
            updateMenuCheck('menu-view-statusbar', false);
        }
    }
}

/**
 * Toggle word wrap
 */
function toggleWordWrap() {
    const editor = document.getElementById('editor');
    const menuBtn = document.getElementById('menu-view-wordwrap');

    if (editor) {
        if (editor.classList.contains('no-wrap')) {
            editor.classList.remove('no-wrap');
            // if (menuBtn) menuBtn.textContent = 'Disable Word Wrap'; // Removed
            localStorage.removeItem('markdown-no-wrap');
            updateMenuCheck('menu-view-wordwrap', true);
        } else {
            editor.classList.add('no-wrap');
            // if (menuBtn) menuBtn.textContent = 'Enable Word Wrap'; // Removed
            localStorage.setItem('markdown-no-wrap', '1');
            updateMenuCheck('menu-view-wordwrap', false);
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

// Initialize scroll sync
function initScrollSync() {
    // Load preference
    const storedSync = localStorage.getItem('markdown-scroll-sync');
    if (storedSync === '0') {
        isScrollSyncEnabled = false;
    } else {
        isScrollSyncEnabled = true;
    }

    // Initial menu check
    if (typeof updateMenuCheck === 'function') {
        updateMenuCheck('menu-view-scrollsync', isScrollSyncEnabled, false);
    }

    const editor = document.getElementById('editor');
    const preview = document.getElementById('preview');

    if (!editor || !preview) return;

    // Scroll Event Listeners with Throttling via requestAnimationFrame
    editor.addEventListener('scroll', () => {
        if (!isScrollSyncEnabled || isSyncingLeft) return;
        isSyncingRight = true;
        window.requestAnimationFrame(() => {
            syncPreview();
            // Reset lock after a small delay to allow target to settle
            clearTimeout(syncTimeoutRight);
            syncTimeoutRight = setTimeout(() => { isSyncingRight = false; }, 100);
        });
    });

    preview.addEventListener('scroll', () => {
        if (!isScrollSyncEnabled || isSyncingRight) return;
        isSyncingLeft = true;
        window.requestAnimationFrame(() => {
            syncEditor();
            // Reset lock after a small delay to allow target to settle
            clearTimeout(syncTimeoutLeft);
            syncTimeoutLeft = setTimeout(() => { isSyncingLeft = false; }, 100);
        });
    });

    // Input Debouncing for Map Rebuild
    editor.addEventListener('input', () => {
        if (!isScrollSyncEnabled) return;
        clearTimeout(buildMapTimeout);
        buildMapTimeout = setTimeout(() => {
            buildScrollMap();
        }, 300); // 300ms debounce
    });

    // Rebuild map when images load in preview
    // Use MutationObserver to detect DOM changes in preview (like images loading/rendering)
    const observer = new MutationObserver((mutations) => {
        let shouldRebuild = false;
        for (const mutation of mutations) {
            if (mutation.type === 'childList' || (mutation.type === 'attributes' && mutation.target.tagName === 'IMG')) {
                shouldRebuild = true;
                break;
            }
        }
        if (shouldRebuild) {
            // Debounce image load rebuilds too
            clearTimeout(buildMapTimeout);
            buildMapTimeout = setTimeout(buildScrollMap, 300);
        }
    });
    observer.observe(preview, { childList: true, subtree: true, attributes: true, attributeFilter: ['src', 'height'] });

    // Initial build
    setTimeout(buildScrollMap, 500);
}

// Toggle Scroll Sync
function toggleScrollSync() {
    isScrollSyncEnabled = !isScrollSyncEnabled;
    localStorage.setItem('markdown-scroll-sync', isScrollSyncEnabled ? '1' : '0');

    if (typeof updateMenuCheck === 'function') {
        updateMenuCheck('menu-view-scrollsync', isScrollSyncEnabled);
    }

    if (isScrollSyncEnabled) {
        updateStatus('Scroll Sync Enabled');
        buildScrollMap();
        syncPreview(); // Initial sync
    } else {
        updateStatus('Scroll Sync Disabled');
    }
}

// Build the mapping between Editor lines and Preview elements (Anchors)
function buildScrollMap() {
    const editor = document.getElementById('editor');
    const preview = document.getElementById('preview');
    if (!editor || !preview) return;

    const sourceText = editor.value;
    const lines = sourceText.split('\n');
    const editorHeaders = [];

    // 1. Find Editor Anchors (Headers)
    // We only track top-level headers (start of line)
    // Matches: # Header, ## Header, etc.
    // Skip headers inside code blocks is tricky without full parser state, 
    // but we can do a simple check for code block fences.
    let inCodeBlock = false;
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (line.trim().startsWith('```')) {
            inCodeBlock = !inCodeBlock;
            continue;
        }
        if (inCodeBlock) continue;

        if (line.match(/^#{1,6}\s/)) {
            editorHeaders.push({ line: i, text: line });
        }
    }

    // 2. Find Preview Anchors
    const previewHeadersNodeList = preview.querySelectorAll('h1, h2, h3, h4, h5, h6');
    const previewHeaders = Array.from(previewHeadersNodeList);

    // 3. Map them
    // We map pairs based on index. Minimizing length mismatch processing for now.
    // Ideally we would match content, but index is faster and usually sufficient for sync.
    const count = Math.min(editorHeaders.length, previewHeaders.length);

    scrollMap = [];

    // Always add Start (Line 0 -> Top of Preview)
    scrollMap.push({ editorLine: 0, previewTop: 0 });

    for (let i = 0; i < count; i++) {
        scrollMap.push({
            editorLine: editorHeaders[i].line,
            previewTop: previewHeaders[i].offsetTop
        });
    }

    // Always add End (Last Line -> Bottom of Preview)
    scrollMap.push({
        editorLine: lines.length,
        previewTop: preview.scrollHeight
    });
}

// Sync Preview based on Editor position
function syncPreview() {
    if (!scrollMap || scrollMap.length < 2) {
        buildScrollMap();
        if (!scrollMap || scrollMap.length < 2) return;
    }

    const editor = document.getElementById('editor');
    const previewContainer = document.getElementById('preview');

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
        if (currentLine >= scrollMap[i].editorLine && currentLine < scrollMap[i + 1].editorLine) {
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
    const targetScrollTop = startNode.previewTop + (previewSpan * progress);

    previewContainer.scrollTop = targetScrollTop;
}

// Sync Editor based on Preview position
function syncEditor() {
    if (!scrollMap || scrollMap.length < 2) {
        buildScrollMap();
        if (!scrollMap || scrollMap.length < 2) return;
    }

    const editor = document.getElementById('editor');
    const previewContainer = document.getElementById('preview');
    const currentScrollTop = previewContainer.scrollTop;

    // Find section in map
    let startNode = scrollMap[0];
    let endNode = scrollMap[1];
    let found = false;

    for (let i = 0; i < scrollMap.length - 1; i++) {
        if (currentScrollTop >= scrollMap[i].previewTop && currentScrollTop < scrollMap[i + 1].previewTop) {
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
    const targetLine = startNode.editorLine + (lineSpan * progress);

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
        const win = window.open(url, '_blank');
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
    const container = document.createElement('div');
    container.className = 'check-anim-container';

    // Position
    const rect = target.getBoundingClientRect();
    container.style.left = rect.left + 'px';
    container.style.top = rect.top + 'px';
    container.style.width = rect.width + 'px';
    container.style.height = rect.height + 'px';

    // Create SVG
    container.innerHTML = `
        <svg class="check-anim-svg" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
            <path class="check-anim-path" d="m4 12 5 5L20 6" />
        </svg>
    `;

    document.body.appendChild(container);

    // Trigger animation frame
    requestAnimationFrame(() => {
        container.classList.add('animate-check-start');
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
    const existingIcon = btn.querySelector('.menu-check-icon');
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
            btn.classList.add('menu-check-active');
        } else {
            // Static visible state
            svg.style.opacity = '1';
            svg.style.transform = 'scale(1)';
            path.style.strokeDashoffset = '0';
        }
    } else {
        btn.classList.remove('menu-check-active');
    }
}

// ========================================
// FILE LOADED INDICATOR
// ========================================
// This marker indicates the file loaded successfully
window.MAIN_MD_FUNCTION_LOADED = true;
console.log('✓ function.js loaded successfully');
// Flag to indicate successful loading
window.MAIN_MD_FUNCTION_LOADED = true;
