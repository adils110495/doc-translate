<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Document Translation</title>
    <link rel="stylesheet" href="assets/css/style.css?v=<?php echo filemtime(__DIR__ . '/assets/css/style.css'); ?>">
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/toastr.js/latest/toastr.min.css">
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
</head>
<body>
    <div class="container">
        <!-- LEFT SIDE: Translated Files Explorer -->
        <div class="left-panel">
            <div class="panel-header">
                <h2>Translated Files</h2>
                <div class="header-actions">
                    <button class="refresh-btn icon-btn" onclick="loadTranslatedFiles()" title="Refresh">
                        <i class="fas fa-sync-alt"></i>
                    </button>
                    <button class="icon-btn" onclick="openManageHidden()" title="Manage Hidden Items">
                        <i class="fas fa-eye-slash"></i>
                    </button>
                    <button class="log-btn icon-btn" onclick="toggleLogViewer()" title="View Logs">
                        <i class="fas fa-file-alt"></i>
                    </button>
                </div>
            </div>

            <div class="bulk-actions">
                <button class="btn-download" onclick="bulkDownload()">
                    <i class="fas fa-download"></i> Download Selected
                </button>
                <button class="btn-delete" onclick="bulkDelete()">
                    <i class="fas fa-trash"></i> Delete Selected
                </button>
            </div>

            <div class="filter-bar">
                <select id="filter-project" onchange="onProjectFilterChange()">
                    <option value="">All Projects</option>
                </select>
                <select id="filter-topic" onchange="applyFilters()">
                    <option value="">All Topics</option>
                </select>
                <input type="text" id="filter-file" placeholder="Filter by file..." oninput="applyFilters()">
            </div>

            <div id="files-container" class="files-container">
                <p class="loading">Loading files...</p>
            </div>

            <!-- Log Viewer Modal -->
            <div id="log-viewer" class="modal" style="display: none;">
                <div class="modal-content">
                    <div class="modal-header">
                        <h3><i class="fas fa-file-alt"></i> Translation Logs</h3>
                        <button class="close-btn" onclick="toggleLogViewer()">
                            <i class="fas fa-times"></i>
                        </button>
                    </div>
                    <div class="modal-body">
                        <div class="log-controls">
                            <button onclick="refreshLogs()" class="btn-refresh">
                                <i class="fas fa-sync-alt"></i> Refresh
                            </button>
                            <select id="log-lines" onchange="refreshLogs()">
                                <option value="50">Last 50 lines</option>
                                <option value="100" selected>Last 100 lines</option>
                                <option value="200">Last 200 lines</option>
                                <option value="500">Last 500 lines</option>
                            </select>
                        </div>
                        <div id="log-content" class="log-content">
                            <p class="loading">Loading logs...</p>
                        </div>
                    </div>
                </div>
            </div>
            <!-- Manage Hidden Items Modal -->
            <div id="manage-hidden-modal" class="modal" style="display: none;">
                <div class="modal-content">
                    <div class="modal-header">
                        <h3><i class="fas fa-eye-slash"></i> Manage Hidden Items</h3>
                        <button class="close-btn" onclick="closeManageHidden()">
                            <i class="fas fa-times"></i>
                        </button>
                    </div>
                    <div class="modal-body">
                        <div id="hidden-items-list">
                            <p class="loading">Loading...</p>
                        </div>
                    </div>
                </div>
            </div>
        </div>

        <!-- RIGHT SIDE: Upload & Translation Form -->
        <div class="right-panel">
            <div class="panel-header">
                <h2>Upload & Translate</h2>
            </div>

            <form id="translation-form" enctype="multipart/form-data">
                <!-- File Source Selection -->
                <div class="form-group">
                    <label>File Source</label>
                    <div class="radio-group">
                        <label class="radio-label">
                            <input type="radio" name="file_source" value="upload" onchange="toggleFileSource()">
                            <span>Upload New File</span>
                        </label>
                        <label class="radio-label">
                            <input type="radio" name="file_source" value="existing" checked onchange="toggleFileSource()">
                            <span>Use Existing File</span>
                        </label>
                    </div>
                </div>

                <!-- Upload New File -->
                <div id="upload-section" class="form-group" style="display: none;">
                    <label for="docx-file">DOCX File *</label>
                    <input type="file" id="docx-file" name="docx_file" accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document">
                    <small>Only .docx files are allowed</small>
                </div>

                <!-- Select Existing File -->
                <div id="existing-section" class="form-group">
                    <label for="existing-file">Select Existing File *</label>
                    <select id="existing-file" name="existing_file" class="file-select">
                        <option value="">Loading files...</option>
                    </select>
                    <small>Choose from previously uploaded files</small>
                </div>

                <div class="form-group">
                    <label for="target-language">Target Language *</label>
                    <select id="target-language" name="target_language" required>
                        <option value="">Select Language</option>
                        <option value="EN-US">English</option>
                        <option value="DA">Danish</option>
                        <option value="NL">Dutch</option>
                        <option value="ET">Estonian</option>
                        <option value="FI">Finnish</option>
                        <option value="DE">German</option>
                        <option value="IS">Icelandic</option>
                        <option value="LV">Latvian</option>
                        <option value="NB">Norwegian</option>
                        <option value="RO">Romanian</option>
                        <option value="RU">Russian</option>
                        <option value="SV">Swedish</option>
                    </select>
                </div>

                <div class="form-group">
                    <label for="project-name">Project Name *</label>
                    <input type="text" id="project-name" name="project_name" placeholder="e.g., ProjectA" required>
                </div>

                <div class="form-group">
                    <label for="topic-name">Topic Name *</label>
                    <input type="text" id="topic-name" name="topic_name" placeholder="e.g., Legal" required>
                </div>

                <div class="form-group">
                    <label class="checkbox-label">
                        <input type="checkbox" id="include-links" name="include_links" value="1">
                        <span>Include hyperlinks in document</span>
                    </label>
                    <small>When enabled, keywords and airline names will have clickable links</small>
                </div>

                <div class="form-group">
                    <label class="checkbox-label">
                        <input type="checkbox" id="bold-fixed-words" name="bold_fixed_words" value="1">
                        <span>Bold fixed words</span>
                    </label>
                    <small>When enabled, fixed/keyword terms will be formatted in bold</small>
                </div>

                <button type="submit" class="btn-submit">
                    <i class="fas fa-language"></i> Translate Document
                </button>
            </form>

            <div class="info-box">
                <h3><i class="fas fa-info-circle"></i> Instructions</h3>
                <ul>
                    <li>Upload new DOCX files or reuse existing ones</li>
                    <li>Translations run in the background</li>
                    <li>Source files stored separately from translations</li>
                    <li>Original layout is preserved</li>
                    <li>View logs to track translation history</li>
                </ul>
            </div>
        </div>
    </div>

    <script src="https://code.jquery.com/jquery-3.6.0.min.js"></script>
    <script src="https://cdnjs.cloudflare.com/ajax/libs/toastr.js/latest/toastr.min.js"></script>
    <script src="assets/js/script.js?v=<?php echo filemtime(__DIR__ . '/assets/js/script.js'); ?>"></script>
</body>
</html>
