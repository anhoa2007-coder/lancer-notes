// ========================================
// MARKDOWN EDITOR - CORE FUNCTIONS
// main-mdfunction.js
// Build 5113
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

        // Bold and italic only
        .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
        .replace(/\*(.*?)\*/g, '<em>$1</em>')

        // Code blocks
        .replace(/```(\w+)?\n([\s\S]*?)```/g, (match, lang, code) => `<pre><code>${code.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</code></pre>`)
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

    // List processing (Unordered and Ordered) - Supports nesting
    // We capture all list lines first, then process them recursively
    const listBlockRegex = /^(?:[ \t]*)(?:[\*\-\+]|\d+\.) (?:.*)(?:\r?\n(?:[ \t]*)(?:[\*\-\+]|\d+\.) (?:.*))*/gm;

    html = html.replace(listBlockRegex, function (match) {
        const lines = match.split(/\r?\n/);

        function processListItems(lines, depth) {
            let result = '';
            let currentListType = null; // 'ul' or 'ol'

            for (let i = 0; i < lines.length; i++) {
                const line = lines[i];
                if (!line.trim()) continue;

                // Determine indentation level (approx 4 spaces or 1 tab per level)
                const indentMatch = line.match(/^(\s*)/);
                const indentLevel = indentMatch ? Math.floor(indentMatch[1].replace(/\t/g, '    ').length / 4) : 0;

                // Determine list type
                const isOrdered = /^\s*\d+\./.test(line);
                const listType = isOrdered ? 'ol' : 'ul';

                // Extract content
                let content = line.replace(/^\s*(?:[\*\-\+]|\d+\.)\s+/, '');

                // Check if we need to start a new list or close one
                if (indentLevel > depth) {
                    // Start sublist (recursive call)
                    // Gather all subsequent lines that are deeper
                    let subLines = [];
                    let j = i;
                    while (j < lines.length) {
                        const nextLine = lines[j];
                        const nextIndent = (nextLine.match(/^(\s*)/) || ['', ''])[1].replace(/\t/g, '    ').length / 4;
                        if (nextIndent < indentLevel) break; // Back to parent
                        subLines.push(nextLine);
                        j++;
                    }
                    // Process sublist
                    // We need to properly wrap this in the previous LI if possible, or just append
                    // Ideally, recursion handles the structure properly
                    // Simplified approach: Flat loop for current depth, recursion for children is tricky in a simple loop without lookahead
                    // Let's stick to the structure:
                    // If we found a deeper item *immediately*, it belongs to the previous LI (but standard markdown sometimes puts it on next line)
                }
            }
            // Retrying a cleaner recursive parser strategy for just this block
            return processListRecursive(lines, 0);
        }

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

            for (let i = 0; i < lines.length; i++) {
                const line = lines[i];
                const indentMatch = line.match(/^(\s*)/);
                const indentLen = indentMatch ? indentMatch[1].replace(/\t/g, '    ').length : 0;

                // If line is deeper than baseIndent + 4, it's a child of the previous item
                // However, we are iterating line by line.
                // Standard approach: 
                // 1. Identify list type of current line at this level
                // 2. Wrap content
                // 3. Look ahead for children
            }

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
            let flags = 'g'; if (!cs) flags += 'i'; if (flagM) flags += 'm'; if (flagS) flags += 's';
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
// DIALOGS
// ========================================

/**
 * Show link or image insertion dialog
 * @param {string} type - 'link' or 'image'
 */
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

    overlay.style.display = 'block';
    dialog.style.display = 'block';
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
        overlay.style.display = 'none';
        dialog.style.display = 'none';
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

    overlay.style.display = 'block';
    dialog.style.display = 'block';

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
        overlay.style.display = 'none';
        dialog.style.display = 'none';
        insertBtn.removeEventListener('click', handleInsert);
        cancelBtn.removeEventListener('click', handleCancel);
        editor.focus();
    };

    insertBtn.addEventListener('click', handleInsert);
    cancelBtn.addEventListener('click', handleCancel);
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
    overlay.style.display = 'block';
    alertBox.style.display = 'block';

    const closeAlert = () => {
        alertBox.style.display = 'none';
        overlay.style.display = 'none';
        okBtn.removeEventListener('click', closeAlert);
        if (callback) callback();
    };
    okBtn.addEventListener('click', closeAlert);
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
    window.open('https://github.com/anhoa2007-coder/lancer-notes/releases', '_blank');
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
    } else {
        localStorage.removeItem('markdown-dark-mode');
        updateMenuCheck('menu-view-darkmode', false);
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
console.log('✓ main-mdfunction.js loaded successfully');
// Flag to indicate successful loading
window.MAIN_MD_FUNCTION_LOADED = true;
