<?php
header('Cache-Control: no-cache, no-store, must-revalidate');
header('Pragma: no-cache');
header('Expires: 0');
$cssV = filemtime(__DIR__ . '/assets/css/style.css');
$jsV  = filemtime(__DIR__ . '/assets/js/link-editor.js');
?><!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Link Editor – Document Translation</title>
    <link rel="stylesheet" href="assets/css/style.css?v=<?php echo $cssV; ?>">
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
    <link href="https://cdn.quilljs.com/1.3.7/quill.snow.css" rel="stylesheet">
    <style>
        /* Force overrides — bypasses any cached external CSS */
        .source-input-wrap { flex: 0 0 50% !important; width: 50% !important; }
        .source-analysis-output { flex: 1 1 0 !important; min-width: 0 !important; }
    </style>
</head>
<body>

<div class="link-editor-wrapper">

    <!-- ════════════════════════════════════════════════════════════
         FULL-WIDTH LINK MAPPER BAR
    ════════════════════════════════════════════════════════════ -->
    <div class="link-mapper-bar">

        <!-- Main row: status · tabs · actions -->
        <div class="mapper-bar-main">
            <div class="base-file-info">
                <div class="base-file-icon-wrap">
                    <i class="fas fa-file-code" id="base-file-icon"></i>
                </div>
                <div class="base-file-details">
                    <span class="base-file-label">Link Mapper</span>
                    <span class="base-file-name" id="base-file-name">default (translation-links.json)</span>
                </div>
            </div>

            <div class="mapper-tabs">
                <button class="mapper-tab active" id="tab-upload" onclick="switchMapperTab('upload')">
                    <i class="fas fa-upload"></i> Upload File
                </button>
                <button class="mapper-tab" id="tab-paste" onclick="switchMapperTab('paste')">
                    <i class="fas fa-paste"></i> Paste JSON
                </button>
            </div>

            <div class="mapper-bar-actions">
                <button class="btn-bar-action" id="btn-edit-mapper" onclick="editCurrentMapper()" title="Load current mapper into editor for editing">
                    <i class="fas fa-pen-to-square"></i> Edit
                </button>
                <button class="btn-bar-action" id="btn-view-json" onclick="toggleCurrentJson()" title="View active mapper JSON">
                    <i class="fas fa-eye"></i> View JSON
                </button>
                <button class="btn-bar-action" id="btn-show-sample" onclick="toggleSample()">
                    <i class="fas fa-lightbulb"></i> Sample
                </button>
                <button class="btn-bar-action" id="btn-show-source" onclick="toggleSourceContent()" title="Paste source HTML to analyze paragraph-level links">
                    <i class="fas fa-file-import"></i> Source Content
                    <span class="source-badge-mini" id="source-badge-mini" style="display:none"></span>
                </button>
                <button id="btn-clear-mapper" class="icon-btn btn-danger-icon" onclick="clearBaseFile()" title="Reset to default" style="display:none">
                    <i class="fas fa-times"></i>
                </button>
            </div>
        </div>

        <!-- Upload tab content -->
        <div class="mapper-bar-content" id="mapper-upload-content">
            <label class="btn-choose-file" for="base-file-input">
                <i class="fas fa-folder-open"></i> Choose File
            </label>
            <input type="file" id="base-file-input" accept=".json" style="display:none">
            <span class="upload-file-label" id="upload-file-label">No file chosen</span>
        </div>

        <!-- Paste tab content -->
        <div class="mapper-bar-content mapper-paste-row" id="mapper-paste-content" style="display:none">
            <textarea id="json-paste-area" class="json-paste-area" placeholder='Paste your link mapper JSON here…'></textarea>
            <div class="paste-actions">
                <button class="btn-apply-json" onclick="applyPastedJson()">
                    <i class="fas fa-floppy-disk"></i> Apply &amp; Save
                </button>
                <button class="btn-apply-json btn-save-default" onclick="saveAsDefault()" title="Overwrite translation-links.json with this JSON">
                    <i class="fas fa-database"></i> Save as default
                </button>
                <span class="paste-hint" id="paste-hint"></span>
            </div>
        </div>

        <!-- Current / active mapper viewer (collapsible) -->
        <div id="current-json" class="current-json-panel" style="display:none">
            <div class="current-json-header">
                <div class="current-json-title">
                    <i class="fas fa-eye"></i>
                    <span>Active mapper: </span>
                    <strong id="current-json-label">translation-links.json (default)</strong>
                </div>
                <div class="current-json-actions">
                    <button class="btn-load-to-editor" onclick="loadCurrentToEditor()" title="Load into Paste JSON tab for editing">
                        <i class="fas fa-pen-to-square"></i> Load to editor
                    </button>
                    <button class="btn-copy-sample" id="btn-copy-current" onclick="copyCurrentJson()">
                        <i class="fas fa-copy"></i> Copy
                    </button>
                </div>
            </div>
            <pre class="sample-code current-json-pre" id="current-json-pre"></pre>
        </div>

        <!-- Source Content Panel (collapsible) -->
        <div id="source-content-panel" class="source-content-panel" style="display:none">
            <div class="source-panel-header">
                <div class="source-panel-title">
                    <i class="fas fa-file-import"></i>
                    <span>Paste source HTML (with links) — analyze paragraph anchors, then apply to target in left editor</span>
                </div>
                <span class="source-links-count" id="source-links-count"></span>
            </div>
            <div class="source-panel-body">
                <div class="source-input-wrap">
                    <div id="editor-source" class="quill-pane source-quill-pane"></div>
                    <textarea id="source-view-raw" class="source-view source-view-raw" style="display:none"></textarea>
                    <div class="source-input-actions">
                        <button class="btn-apply-json btn-analyze-source" onclick="analyzeSource()">
                            <i class="fas fa-magnifying-glass"></i> Analyze Links
                        </button>
                        <button class="icon-btn" id="btn-source-toggle" onclick="toggleSourceView()" title="Toggle HTML source view">
                            <i class="fas fa-code"></i>
                        </button>
                        <button class="btn-apply-json" onclick="clearSource()">
                            <i class="fas fa-times"></i> Clear
                        </button>
                    </div>
                </div>
                <div class="source-analysis-output" id="source-analysis-output">
                    <span class="source-analysis-hint">Paste source HTML above and click <strong>Analyze Links</strong> to see which paragraphs contain links and whether they match the active link mapper.</span>
                </div>
            </div>
        </div>

        <!-- Sample JSON (collapsible) -->
        <div id="sample-json" class="sample-json" style="display:none">
            <div class="sample-json-header">
                <span>Sample format — keys must match fixed-words.json terms</span>
                <button class="btn-copy-sample" onclick="copySample()" id="btn-copy-sample">
                    <i class="fas fa-copy"></i> Copy
                </button>
            </div>
            <pre class="sample-code">{
  "delay": {
    "en": {
      "link": "https://example.com/flight-delay/",
      "translations": ["delay", "delays", "delayed", "flight delay", "delayed flight"]
    },
    "de": {
      "link": "https://example.com/de/flugverspaetung/",
      "translations": ["verspätung", "flugverspätung", "verspäteter flug"]
    }
  },
  "cancelled": {
    "en": {
      "link": "https://example.com/cancellation/",
      "translations": ["cancelled", "canceled", "flight cancelled", "flight cancellation"]
    },
    "de": {
      "link": "https://example.com/de/stornierung/",
      "translations": ["stornierung", "annullierung", "annullierter flug"]
    }
  },
  "claim": {
    "en": {
      "link": "https://example.com/submit-claim/",
      "translations": ["claim", "compensation claim", "submit a claim"]
    }
  }
}</pre>
        </div>

    </div><!-- /.link-mapper-bar -->

    <!-- ════════════════════════════════════════════════════════════
         EDITORS ROW  (fills remaining height)
    ════════════════════════════════════════════════════════════ -->
    <div class="container link-editor-layout">

        <!-- LEFT: WYSIWYG Content Editor -->
        <div class="left-panel">
            <div class="panel-header">
                <div class="header-title-group">
                    <a href="index.php" class="icon-btn back-btn" title="Back to Translator">
                        <i class="fas fa-arrow-left"></i>
                    </a>
                    <h2>Content Editor</h2>
                </div>
                <div class="header-actions">
                    <select id="editor-language" class="lang-select-inline" title="Language for link detection">
                        <!-- populated by link-editor.js -->
                    </select>
                    <button class="icon-btn" id="btn-refresh-preview" onclick="updatePreview()" title="Refresh link preview">
                        <i class="fas fa-rotate-right"></i>
                    </button>
                    <button class="icon-btn" id="btn-source-left" onclick="toggleSource('left')" title="Toggle HTML source view">
                        <i class="fas fa-code"></i>
                    </button>
                    <button class="icon-btn" id="btn-copy-content" onclick="copyEditorContent()" title="Copy editor HTML">
                        <i class="fas fa-copy"></i>
                    </button>
                    <button class="icon-btn" onclick="clearEditor()" title="Clear editor">
                        <i class="fas fa-eraser"></i>
                    </button>
                </div>
            </div>
            <div id="editor-left" class="quill-pane"></div>
            <textarea id="source-left" class="source-view" style="display:none"></textarea>
            <div class="editor-footer">
                <span id="word-count">0 words</span>
                <span class="footer-sep">·</span>
                <span id="char-count">0 chars</span>
            </div>
        </div>

        <!-- MIDDLE: Action buttons -->
        <div class="editor-middle-actions">
            <button class="mid-btn" onclick="updatePreview()" title="Apply links to preview">
                <i class="fas fa-arrow-right"></i>
            </button>
            <button class="mid-btn" onclick="copyLeftToRight()" title="Copy content as-is to preview">
                <i class="fas fa-clone"></i>
            </button>
            <button class="mid-btn" onclick="swapEditors()" title="Swap editor contents">
                <i class="fas fa-right-left"></i>
            </button>
            <button class="mid-btn" onclick="copyPreviewHtml()" title="Copy preview HTML">
                <i class="fas fa-copy"></i>
            </button>
            <button class="mid-btn" onclick="clearEditor()" title="Clear content editor">
                <i class="fas fa-eraser"></i>
            </button>
        </div>

        <!-- RIGHT: Live Preview (WYSIWYG, editable) -->
        <div class="right-panel link-editor-right">
            <div class="panel-header">
                <h2>Link Preview</h2>
                <div class="header-actions">
                    <span id="links-found-badge" class="links-badge">No links found</span>
                    <button class="icon-btn" id="btn-source-right" onclick="toggleSource('right')" title="Toggle HTML source view">
                        <i class="fas fa-code"></i>
                    </button>
                    <button class="icon-btn" id="btn-clean-spans" onclick="toggleCleanSpans()" title="Strip &lt;span&gt; tags from output">
                        <i class="fas fa-broom"></i>
                    </button>
                    <button class="icon-btn" id="btn-copy-html" onclick="copyPreviewHtml()" title="Copy output HTML">
                        <i class="fas fa-copy"></i>
                    </button>
                </div>
            </div>
            <div id="editor-right" class="quill-pane"></div>
            <textarea id="source-right" class="source-view" style="display:none"></textarea>
        </div>

    </div><!-- /.container -->

</div><!-- /.link-editor-wrapper -->

<!-- Conflict Resolution Modal -->
<div id="conflict-modal" class="modal" style="display:none">
    <div class="modal-content conflict-modal-content">
        <div class="modal-header">
            <h3><i class="fas fa-triangle-exclamation"></i> Resolve Link Conflicts</h3>
            <button class="close-btn" onclick="closeConflictModal()"><i class="fas fa-times"></i></button>
        </div>
        <div class="modal-body">
            <p class="conflict-intro">These phrases appear in multiple languages' link lists. Choose which URL to use for each:</p>
            <div id="conflict-list"></div>
        </div>
        <div class="conflict-modal-footer">
            <button class="btn-conflict-cancel" onclick="closeConflictModal()">
                <i class="fas fa-times"></i> Cancel
            </button>
            <button class="btn-conflict-apply" onclick="applyConflictResolutions()">
                <i class="fas fa-check"></i> Apply Selections
            </button>
        </div>
    </div>
</div>

<script src="https://code.jquery.com/jquery-3.6.0.min.js"></script>
<script src="https://cdn.quilljs.com/1.3.7/quill.min.js"></script>
<script src="assets/js/link-editor.js?v=<?php echo $jsV; ?>"></script>
</body>
</html>
