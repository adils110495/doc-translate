// Cached files data for client-side filtering
let cachedFilesData = null;

// Toast notification configuration
toastr.options = {
    "closeButton": true,
    "progressBar": true,
    "positionClass": "toast-top-right",
    "timeOut": "5000",
    "extendedTimeOut": "1000"
};

// Language code to full name mapping
const languageNames = {
    'EN-US': 'English',
    'DA': 'Danish',
    'NL': 'Dutch',
    'ET': 'Estonian',
    'FI': 'Finnish',
    'DE': 'German',
    'IS': 'Icelandic',
    'LV': 'Latvian',
    'NB': 'Norwegian',
    'RO': 'Romanian',
    'RU': 'Russian',
    'SV': 'Swedish'
};

// Get full language name from code
function getLanguageName(code) {
    return languageNames[code] || code;
}

// Load translated files on page load
$(document).ready(function() {
    loadTranslatedFiles();
    loadSourceFiles();

    // Handle form submission
    $('#translation-form').on('submit', function(e) {
        e.preventDefault();

        const formData = new FormData(this);
        const fileSource = $('input[name="file_source"]:checked').val();
        const fileName = fileSource === 'upload' 
            ? $('#docx-file')[0].files[0]?.name 
            : $('#existing-file option:selected').text();

        // Add file source indicator
        formData.append('use_existing', fileSource === 'existing');

        // Validate file
        if (fileSource === 'upload') {
            const file = $('#docx-file')[0].files[0];
            if (!file) {
                toastr.error('Please select a file to upload');
                return;
            }

            // Check file extension
            const fileExt = file.name.split('.').pop().toLowerCase();
            if (fileExt !== 'docx') {
                toastr.error('Only DOCX files are allowed');
                return;
            }

            // Check file size (max 50MB)
            if (file.size > 50 * 1024 * 1024) {
                toastr.error('File size must be less than 50MB');
                return;
            }
        } else {
            const existingFile = $('#existing-file').val();
            if (!existingFile) {
                toastr.error('Please select an existing file');
                return;
            }
        }

        // Show upload started notification
        toastr.info('Translation started for: ' + fileName);

        // Disable submit button
        const submitBtn = $(this).find('button[type="submit"]');
        const originalHtml = submitBtn.html();
        submitBtn.prop('disabled', true).html('<i class="fas fa-spinner fa-spin"></i> Processing...');

        // Submit form via AJAX
        $.ajax({
            url: 'api/translate.php',
            type: 'POST',
            data: formData,
            processData: false,
            contentType: false,
            success: function(response) {
                try {
                    const data = typeof response === 'string' ? JSON.parse(response) : response;

                    if (data.success) {
                        toastr.success('Translation completed successfully: ' + fileName);

                        // Reset form
                        $('#translation-form')[0].reset();
                        $('input[name="file_source"][value="upload"]').prop('checked', true);
                        toggleFileSource();

                        // Reload files list
                        setTimeout(function() {
                            loadTranslatedFiles();
                            loadSourceFiles();
                        }, 1000);
                    } else {
                        toastr.error(data.message || 'Translation failed');
                    }
                } catch (e) {
                    toastr.error('Error processing response');
                }
            },
            error: function(xhr, status, error) {
                toastr.error('Translation failed: ' + error);
            },
            complete: function() {
                // Re-enable submit button
                submitBtn.prop('disabled', false).html(originalHtml);
            }
        });
    });
});

// Toggle between upload and existing file
function toggleFileSource() {
    const fileSource = $('input[name="file_source"]:checked').val();
    
    if (fileSource === 'upload') {
        $('#upload-section').show();
        $('#existing-section').hide();
        $('#docx-file').prop('required', true);
        $('#existing-file').prop('required', false);
    } else {
        $('#upload-section').hide();
        $('#existing-section').show();
        $('#docx-file').prop('required', false);
        $('#existing-file').prop('required', true);
    }
}

// Load source files for dropdown
function loadSourceFiles() {
    $.ajax({
        url: 'api/get_source_files.php',
        type: 'GET',
        success: function(response) {
            try {
                const data = typeof response === 'string' ? JSON.parse(response) : response;

                if (data.success) {
                    populateSourceFilesDropdown(data.files);
                }
            } catch (e) {
                console.error('Error loading source files:', e);
            }
        }
    });
}

// Populate source files dropdown
function populateSourceFilesDropdown(files) {
    const select = $('#existing-file');
    select.empty();
    select.append('<option value="">Select a file...</option>');

    if (!files || Object.keys(files).length === 0) {
        select.append('<option value="" disabled>No source files available</option>');
        return;
    }

    for (const project in files) {
        const projectGroup = $('<optgroup label="' + escapeHtml(project) + '">');

        for (const topic in files[project]) {
            files[project][topic].forEach(function(file) {
                projectGroup.append(
                    '<option value="' + escapeHtml(file.path) + '" data-project="' + escapeHtml(project) + '" data-topic="' + escapeHtml(topic) + '">' +
                    escapeHtml(topic) + ' / ' + escapeHtml(file.name) +
                    '</option>'
                );
            });
        }

        select.append(projectGroup);
    }

    // Add change handler to prefill project and topic
    select.off('change').on('change', function() {
        const selectedOption = $(this).find('option:selected');
        const project = selectedOption.data('project');
        const topic = selectedOption.data('topic');

        if (project) {
            $('#project-name').val(project);
        }
        if (topic) {
            $('#topic-name').val(topic);
        }
    });
}

// Load translated files
function loadTranslatedFiles() {
    $.ajax({
        url: 'api/get_files.php',
        type: 'GET',
        success: function(response) {
            try {
                const data = typeof response === 'string' ? JSON.parse(response) : response;

                if (data.success) {
                    cachedFilesData = data.files;
                    populateProjectDropdown();
                    applyFilters();
                } else {
                    $('#files-container').html('<p class="loading">' + (data.message || 'No files found') + '</p>');
                }
            } catch (e) {
                $('#files-container').html('<p class="loading">Error loading files</p>');
            }
        },
        error: function() {
            $('#files-container').html('<p class="loading">Error loading files</p>');
        }
    });
}

// Populate project dropdown from cached data
function populateProjectDropdown() {
    const select = $('#filter-project');
    const current = select.val();
    select.empty().append('<option value="">All Projects</option>');
    if (cachedFilesData) {
        Object.keys(cachedFilesData).sort().forEach(function(p) {
            select.append('<option value="' + escapeHtml(p) + '">' + escapeHtml(p) + '</option>');
        });
    }
    select.val(current);
    populateTopicDropdown();
}

// Populate topic dropdown based on selected project
function populateTopicDropdown() {
    const select = $('#filter-topic');
    const current = select.val();
    const selectedProject = $('#filter-project').val();
    select.empty().append('<option value="">All Topics</option>');
    if (cachedFilesData) {
        const projects = selectedProject ? [selectedProject] : Object.keys(cachedFilesData);
        const topics = new Set();
        projects.forEach(function(p) {
            if (cachedFilesData[p]) Object.keys(cachedFilesData[p]).forEach(function(t) { topics.add(t); });
        });
        Array.from(topics).sort().forEach(function(t) {
            select.append('<option value="' + escapeHtml(t) + '">' + escapeHtml(t) + '</option>');
        });
    }
    select.val(current);
}

// When project filter changes, update topic dropdown then filter
function onProjectFilterChange() {
    populateTopicDropdown();
    applyFilters();
}

// Apply project/topic/file filters to cached data
function applyFilters() {
    if (!cachedFilesData) return;

    const projectFilter = $('#filter-project').val() || '';
    const topicFilter = $('#filter-topic').val() || '';
    const fileFilter = ($('#filter-file').val() || '').toLowerCase().trim();

    if (!projectFilter && !topicFilter && !fileFilter) {
        displayFiles(cachedFilesData);
        return;
    }

    const filtered = {};
    for (const project in cachedFilesData) {
        if (projectFilter && project !== projectFilter) continue;

        const filteredTopics = {};
        for (const topic in cachedFilesData[project]) {
            if (topicFilter && topic !== topicFilter) continue;

            const filteredFiles = cachedFilesData[project][topic].filter(function(file) {
                return !fileFilter || file.name.toLowerCase().includes(fileFilter);
            });

            if (filteredFiles.length > 0) {
                filteredTopics[topic] = filteredFiles;
            }
        }

        if (Object.keys(filteredTopics).length > 0) {
            filtered[project] = filteredTopics;
        }
    }

    displayFiles(filtered);
}

// Display files grouped by project and topic
function displayFiles(files) {
    if (!files || Object.keys(files).length === 0) {
        $('#files-container').html('<p class="loading">No translated files yet</p>');
        return;
    }

    let html = '';

    // Group files by project
    for (const project in files) {
        html += '<div class="project-group">';
        html += '<div class="project-title">';
        html += '<span>' + escapeHtml(project) + '</span>';
        html += '<button style="margin-left:8px;background:#95a5a6;color:white;border:none;border-radius:3px;padding:2px 8px;font-size:11px;cursor:pointer;" onmouseover="this.style.background=\'#e74c3c\'" onmouseout="this.style.background=\'#95a5a6\'" onclick="hideItem(\'project\', \'' + escapeHtml(project) + '\')" title="Hide project"><i class="fas fa-eye-slash"></i></button>';
        html += '</div>';

        // Group by topic within project
        for (const topic in files[project]) {
            html += '<div class="topic-group">';
            html += '<div class="topic-title">';
            html += '<span>' + escapeHtml(topic) + '</span>';
            html += '<button style="margin-left:8px;background:#95a5a6;color:white;border:none;border-radius:3px;padding:2px 8px;font-size:11px;cursor:pointer;" onmouseover="this.style.background=\'#e74c3c\'" onmouseout="this.style.background=\'#95a5a6\'" onclick="hideItem(\'topic\', \'' + escapeHtml(topic) + '\')" title="Hide topic"><i class="fas fa-eye-slash"></i></button>';
            html += '</div>';

            // Display files
            files[project][topic].forEach(function(file) {
                html += '<div class="file-item">';
                html += '<input type="checkbox" class="file-checkbox" data-path="' + escapeHtml(file.path) + '">';
                html += '<div class="file-info">';
                html += '<div class="file-name">' + escapeHtml(file.name) + '</div>';
                html += '<div class="file-meta">' + getLanguageName(file.language) + ' | ' + escapeHtml(file.date) + '</div>';
                html += '</div>';
                html += '<div class="file-actions">';
                html += '<button class="icon-btn btn-download-file" onclick="downloadFile(\'' + escapeHtml(file.path) + '\')" title="Download">';
                html += '<i class="fas fa-download"></i>';
                html += '</button>';
                html += '<button class="icon-btn btn-delete-file" onclick="deleteSingleFile(\'' + escapeHtml(file.path) + '\')" title="Delete">';
                html += '<i class="fas fa-trash"></i>';
                html += '</button>';
                html += '</div>';
                html += '</div>';
            });

            html += '</div>';
        }

        html += '</div>';
    }

    $('#files-container').html(html);
}

// Hide a project or topic
function hideItem(type, name) {
    if (!confirm('Hide ' + type + ' "' + name + '"? You can unhide it from the manage hidden panel.')) return;

    $.ajax({
        url: 'api/toggle_hidden.php',
        type: 'POST',
        data: JSON.stringify({ action: 'hide', type: type, name: name }),
        contentType: 'application/json',
        success: function(response) {
            try {
                const data = typeof response === 'string' ? JSON.parse(response) : response;
                if (data.success) {
                    toastr.success(type.charAt(0).toUpperCase() + type.slice(1) + ' "' + name + '" hidden');
                    loadTranslatedFiles();
                } else {
                    toastr.error(data.message || 'Failed to hide ' + type);
                }
            } catch(e) {
                toastr.error('Error processing response');
            }
        },
        error: function() { toastr.error('Failed to hide ' + type); }
    });
}

// Unhide a project or topic
function unhideItem(type, name) {
    $.ajax({
        url: 'api/toggle_hidden.php',
        type: 'POST',
        data: JSON.stringify({ action: 'unhide', type: type, name: name }),
        contentType: 'application/json',
        success: function(response) {
            try {
                const data = typeof response === 'string' ? JSON.parse(response) : response;
                if (data.success) {
                    toastr.success(type.charAt(0).toUpperCase() + type.slice(1) + ' "' + name + '" is now visible');
                    loadHiddenModal();
                    loadTranslatedFiles();
                } else {
                    toastr.error(data.message || 'Failed to unhide ' + type);
                }
            } catch(e) {
                toastr.error('Error processing response');
            }
        },
        error: function() { toastr.error('Failed to unhide ' + type); }
    });
}

// Open manage hidden items modal
function openManageHidden() {
    $('#manage-hidden-modal').fadeIn(300);
    loadHiddenModal();
}

function closeManageHidden() {
    $('#manage-hidden-modal').fadeOut(300);
}

function loadHiddenModal() {
    $.ajax({
        url: 'api/toggle_hidden.php',
        type: 'GET',
        success: function(response) {
            try {
                const data = typeof response === 'string' ? JSON.parse(response) : response;
                if (data.success) renderHiddenModal(data.hidden);
            } catch(e) {}
        }
    });
}

function renderHiddenModal(hidden) {
    const projects = hidden.projects || [];
    const topics   = hidden.topics   || [];

    let html = '';

    if (projects.length === 0 && topics.length === 0) {
        html = '<p class="loading">No hidden projects or topics.</p>';
    } else {
        if (projects.length > 0) {
            html += '<div class="hidden-section-title">Hidden Projects</div>';
            projects.forEach(function(p) {
                html += '<div class="hidden-item">';
                html += '<span>' + escapeHtml(p) + '</span>';
                html += '<button class="icon-btn btn-unhide" onclick="unhideItem(\'project\', \'' + escapeHtml(p) + '\')" title="Unhide"><i class="fas fa-eye"></i></button>';
                html += '</div>';
            });
        }
        if (topics.length > 0) {
            html += '<div class="hidden-section-title">Hidden Topics</div>';
            topics.forEach(function(t) {
                html += '<div class="hidden-item">';
                html += '<span>' + escapeHtml(t) + '</span>';
                html += '<button class="icon-btn btn-unhide" onclick="unhideItem(\'topic\', \'' + escapeHtml(t) + '\')" title="Unhide"><i class="fas fa-eye"></i></button>';
                html += '</div>';
            });
        }
    }

    $('#hidden-items-list').html(html);
}

// Download single file
function downloadFile(path) {
    window.open('api/download.php?file=' + encodeURIComponent(path), '_blank');
}

// Delete single file
function deleteSingleFile(path) {
    if (!confirm('Are you sure you want to delete this file? This action cannot be undone.')) {
        return;
    }

    $.ajax({
        url: 'api/bulk_delete.php',
        type: 'POST',
        data: JSON.stringify({ files: [path] }),
        contentType: 'application/json',
        success: function(response) {
            try {
                const data = typeof response === 'string' ? JSON.parse(response) : response;

                if (data.success) {
                    toastr.success('File deleted successfully');
                    loadTranslatedFiles();
                } else {
                    toastr.error(data.message || 'Failed to delete file');
                }
            } catch (e) {
                toastr.error('Error processing response');
            }
        },
        error: function() {
            toastr.error('Failed to delete file');
        }
    });
}

// Bulk download selected files
function bulkDownload() {
    const selected = getSelectedFiles();

    if (selected.length === 0) {
        toastr.warning('Please select files to download');
        return;
    }

    toastr.info('Preparing download for ' + selected.length + ' file(s)...');

    if (selected.length === 1) {
        // Single file download
        window.open('api/download.php?file=' + encodeURIComponent(selected[0]), '_blank');
    } else {
        // Bulk download as ZIP
        $.ajax({
            url: 'api/bulk_download.php',
            type: 'POST',
            data: JSON.stringify({ files: selected }),
            contentType: 'application/json',
            xhrFields: {
                responseType: 'blob'
            },
            success: function(blob, status, xhr) {
                // Create download link
                const url = window.URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = 'translated_files_' + Date.now() + '.zip';
                document.body.appendChild(a);
                a.click();
                window.URL.revokeObjectURL(url);
                document.body.removeChild(a);

                toastr.success('Download started successfully');
            },
            error: function() {
                toastr.error('Failed to download files');
            }
        });
    }
}

// Bulk delete selected files
function bulkDelete() {
    const selected = getSelectedFiles();

    if (selected.length === 0) {
        toastr.warning('Please select files to delete');
        return;
    }

    if (!confirm('Are you sure you want to delete ' + selected.length + ' file(s)? This action cannot be undone.')) {
        return;
    }

    $.ajax({
        url: 'api/bulk_delete.php',
        type: 'POST',
        data: JSON.stringify({ files: selected }),
        contentType: 'application/json',
        success: function(response) {
            try {
                const data = typeof response === 'string' ? JSON.parse(response) : response;

                if (data.success) {
                    toastr.success(data.message || 'Files deleted successfully');
                    loadTranslatedFiles();
                } else {
                    toastr.error(data.message || 'Failed to delete files');
                }
            } catch (e) {
                toastr.error('Error processing response');
            }
        },
        error: function() {
            toastr.error('Failed to delete files');
        }
    });
}

// Toggle log viewer
function toggleLogViewer() {
    const logViewer = $('#log-viewer');
    if (logViewer.is(':visible')) {
        logViewer.fadeOut(300);
    } else {
        logViewer.fadeIn(300);
        refreshLogs();
    }
}

// Refresh logs
function refreshLogs() {
    const lines = $('#log-lines').val() || 100;
    
    $('#log-content').html('<p class="loading">Loading logs...</p>');
    
    $.ajax({
        url: 'api/get_logs.php?lines=' + lines,
        type: 'GET',
        success: function(response) {
            try {
                const data = typeof response === 'string' ? JSON.parse(response) : response;

                if (data.success) {
                    displayLogs(data.logs, data.total_lines);
                } else {
                    $('#log-content').html('<p class="error">Error: ' + escapeHtml(data.message) + '</p>');
                }
            } catch (e) {
                $('#log-content').html('<p class="error">Error parsing logs</p>');
            }
        },
        error: function() {
            $('#log-content').html('<p class="error">Error loading logs</p>');
        }
    });
}

// Display logs
function displayLogs(logs, totalLines) {
    if (!logs || logs.length === 0) {
        $('#log-content').html('<p class="empty">No logs available</p>');
        return;
    }

    let html = '<div class="log-info">Showing ' + logs.length + ' of ' + totalLines + ' total lines</div>';
    html += '<div class="log-entries">';

    logs.forEach(function(log) {
        const logClass = log.includes('SUCCESS') ? 'log-success' : 
                        log.includes('FAILED') ? 'log-error' : 
                        log.includes('DELETED') ? 'log-warning' : '';
        
        html += '<div class="log-entry ' + logClass + '">' + escapeHtml(log) + '</div>';
    });

    html += '</div>';

    $('#log-content').html(html);
}

// Get selected file paths
function getSelectedFiles() {
    const selected = [];
    $('.file-checkbox:checked').each(function() {
        selected.push($(this).data('path'));
    });
    return selected;
}

// Escape HTML to prevent XSS
function escapeHtml(text) {
    const map = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#039;'
    };
    return String(text).replace(/[&<>"']/g, function(m) { return map[m]; });
}
