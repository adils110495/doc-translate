// Cached files data for client-side filtering
let cachedFilesData = null;
let showHiddenMode = false;
let hiddenProjectsList = [];
let hiddenTopicsList = [];

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
    'AR':    'Arabic',
    'HY':    'Armenian',
    'BS':    'Bosnian',
    'BG':    'Bulgarian',
    'CA':    'Catalan',
    'ZH':    'Chinese (Simplified)',
    'HR':    'Croatian',
    'CS':    'Czech',
    'DA':    'Danish',
    'NL':    'Dutch',
    'EN-US': 'English (US)',
    'EN-GB': 'English (UK)',
    'ET':    'Estonian',
    'FI':    'Finnish',
    'FR':    'French',
    'KA':    'Georgian',
    'DE':    'German',
    'EL':    'Greek',
    'HE':    'Hebrew',
    'HU':    'Hungarian',
    'IS':    'Icelandic',
    'IT':    'Italian',
    'LV':    'Latvian',
    'LT':    'Lithuanian',
    'MK':    'Macedonian',
    'NB':    'Norwegian',
    'PL':    'Polish',
    'PT-PT': 'Portuguese (Portugal)',
    'PT-BR': 'Portuguese (Brazil)',
    'RO':    'Romanian',
    'RU':    'Russian',
    'SR':    'Serbian',
    'SQ':    'Albanian',
    'SL':    'Slovenian',
    'ES':    'Spanish',
    'SV':    'Swedish',
    'TR':    'Turkish',
    'UK':    'Ukrainian'
};

// All languages sorted alphabetically by display name
const allLanguages = Object.entries(languageNames)
    .map(([code, name]) => ({ code, name }))
    .sort((a, b) => a.name.localeCompare(b.name));

function getLanguageName(code) {
    if (code === 'MULTI') return 'Multi-Language';
    return languageNames[code] || code;
}

// ─── Language Multi-Select ────────────────────────────────────────────────────

function initLangSelector() {
    const list = document.getElementById('lang-options-list');
    if (!list) return;
    list.innerHTML = '';
    allLanguages.forEach(function(lang) {
        const label = document.createElement('label');
        label.className = 'lang-option-item';
        const cb = document.createElement('input');
        cb.type = 'checkbox';
        cb.className = 'lang-checkbox';
        cb.value = lang.code;
        cb.addEventListener('change', updateLangDisplay);
        label.appendChild(cb);
        label.appendChild(document.createTextNode(' ' + lang.name));
        list.appendChild(label);
    });
}

function toggleLangDropdown(e) {
    e.stopPropagation();
    const dropdown = document.getElementById('lang-dropdown');
    const arrow = document.getElementById('lang-arrow');
    const isOpen = dropdown.classList.contains('open');
    dropdown.classList.toggle('open', !isOpen);
    arrow.classList.toggle('open', !isOpen);
    if (!isOpen) {
        setTimeout(function() {
            const input = document.getElementById('lang-search-input');
            if (input) input.focus();
        }, 50);
    }
}

function filterLangOptions(query) {
    const q = query.toLowerCase();
    document.querySelectorAll('.lang-option-item:not(.lang-select-all-item)').forEach(function(item) {
        item.style.display = item.textContent.toLowerCase().includes(q) ? '' : 'none';
    });
    syncSelectAll();
}

function toggleSelectAllLangs(masterCb) {
    document.querySelectorAll('.lang-option-item:not(.lang-select-all-item)').forEach(function(item) {
        if (item.style.display !== 'none') {
            const cb = item.querySelector('.lang-checkbox');
            if (cb) cb.checked = masterCb.checked;
        }
    });
    updateLangDisplay();
}

function syncSelectAll() {
    const allVisible = Array.from(document.querySelectorAll('.lang-option-item:not(.lang-select-all-item)'))
        .filter(item => item.style.display !== 'none');
    const allChecked = allVisible.length > 0 && allVisible.every(item => {
        const cb = item.querySelector('.lang-checkbox');
        return cb && cb.checked;
    });
    const masterCb = document.getElementById('lang-select-all');
    if (masterCb) masterCb.checked = allChecked;
}

function getSelectedLanguages() {
    return Array.from(document.querySelectorAll('.lang-checkbox:checked')).map(cb => cb.value);
}

function updateLangDisplay() {
    const selected = getSelectedLanguages();
    const display = document.getElementById('lang-selected-display');
    if (!display) return;
    if (selected.length === 0) {
        display.innerHTML = '<span class="lang-placeholder">Select language(s)...</span>';
    } else {
        const shown = selected.slice(0, 4);
        let html = shown.map(code => '<span class="lang-tag">' + escapeHtml(getLanguageName(code)) + '</span>').join('');
        if (selected.length > 4) {
            html += '<span class="lang-tag lang-tag-more">+' + (selected.length - 4) + ' more</span>';
        }
        display.innerHTML = html;
    }
    syncSelectAll();
}

function clearLangSelection() {
    document.querySelectorAll('.lang-checkbox').forEach(function(cb) { cb.checked = false; });
    updateLangDisplay();
}

// ─── Translation Requests ─────────────────────────────────────────────────────

function submitSingleTranslation(formData) {
    return new Promise(function(resolve, reject) {
        $.ajax({
            url: 'api/translate.php',
            type: 'POST',
            data: formData,
            processData: false,
            contentType: false,
            success: function(response) {
                try {
                    const data = typeof response === 'string' ? JSON.parse(response) : response;
                    if (data.success) resolve(data);
                    else reject(new Error(data.message || 'Translation failed'));
                } catch(e) {
                    reject(new Error('Error processing response'));
                }
            },
            error: function(xhr, status, error) {
                reject(new Error(error || 'Request failed'));
            }
        });
    });
}

function submitMultiTranslation(formData) {
    return new Promise(function(resolve, reject) {
        $.ajax({
            url: 'api/translate_multi.php',
            type: 'POST',
            data: formData,
            processData: false,
            contentType: false,
            success: function(response) {
                try {
                    const data = typeof response === 'string' ? JSON.parse(response) : response;
                    if (data.success) resolve(data);
                    else reject(new Error(data.message || 'Translation failed'));
                } catch(e) {
                    reject(new Error('Error processing response'));
                }
            },
            error: function(xhr, status, error) {
                reject(new Error(error || 'Request failed'));
            }
        });
    });
}

// ─── Init ─────────────────────────────────────────────────────────────────────

$(document).ready(function() {
    initLangSelector();
    loadTranslatedFiles();
    loadSourceFiles();

    // Close lang dropdown when clicking outside
    document.addEventListener('click', function(e) {
        const ms = document.getElementById('lang-multiselect');
        if (ms && !ms.contains(e.target)) {
            const dropdown = document.getElementById('lang-dropdown');
            const arrow = document.getElementById('lang-arrow');
            if (dropdown) dropdown.classList.remove('open');
            if (arrow) arrow.classList.remove('open');
        }
    });

    // Handle form submission
    $('#translation-form').on('submit', async function(e) {
        e.preventDefault();

        const selectedLanguages = getSelectedLanguages();
        if (selectedLanguages.length === 0) {
            toastr.error('Please select at least one language');
            return;
        }

        const fileSource = $('input[name="file_source"]:checked').val();
        const fileName = fileSource === 'upload'
            ? ($('#docx-file')[0].files[0] ? $('#docx-file')[0].files[0].name : '')
            : $('#existing-file option:selected').text();

        // Validate file
        if (fileSource === 'upload') {
            const file = $('#docx-file')[0].files[0];
            if (!file) { toastr.error('Please select a file to upload'); return; }
            if (file.name.split('.').pop().toLowerCase() !== 'docx') { toastr.error('Only DOCX files are allowed'); return; }
            if (file.size > 50 * 1024 * 1024) { toastr.error('File size must be less than 50MB'); return; }
        } else {
            if (!$('#existing-file').val()) { toastr.error('Please select an existing file'); return; }
        }

        const submitBtn = $(this).find('button[type="submit"]');
        const originalHtml = submitBtn.html();
        submitBtn.prop('disabled', true);

        const baseFormData = new FormData(this);
        baseFormData.set('use_existing', fileSource === 'existing' ? 'true' : 'false');

        if (selectedLanguages.length === 1) {
            // Single language — use existing endpoint
            const lang = selectedLanguages[0];
            submitBtn.html('<i class="fas fa-spinner fa-spin"></i> Translating...');

            const fd = new FormData();
            for (const [key, val] of baseFormData.entries()) {
                fd.append(key, val);
            }
            fd.set('target_language', lang);

            try {
                await submitSingleTranslation(fd);
                toastr.success('Translation completed: ' + fileName);
                $('#translation-form')[0].reset();
                $('input[name="file_source"][value="existing"]').prop('checked', true);
                toggleFileSource();
                clearLangSelection();
                setTimeout(function() { loadTranslatedFiles(); loadSourceFiles(); }, 1000);
            } catch(err) {
                toastr.error(err.message || 'Translation failed');
            }

        } else {
            // Multiple languages — send all at once, get one combined document
            submitBtn.html('<i class="fas fa-spinner fa-spin"></i> Translating ' + selectedLanguages.length + ' languages into one document...');

            const fd = new FormData();
            for (const [key, val] of baseFormData.entries()) {
                fd.append(key, val);
            }
            selectedLanguages.forEach(function(lang) {
                fd.append('target_languages[]', lang);
            });

            try {
                const result = await submitMultiTranslation(fd);
                const succeeded = result.data.languages.length;
                const failed    = result.data.failed_languages.length;

                if (failed === 0) {
                    toastr.success(succeeded + ' language' + (succeeded !== 1 ? 's' : '') + ' combined into one document: ' + fileName);
                } else {
                    toastr.warning(
                        succeeded + ' of ' + selectedLanguages.length + ' languages translated. ' +
                        'Failed: ' + result.data.failed_languages.join(', ')
                    );
                }

                $('#translation-form')[0].reset();
                $('input[name="file_source"][value="existing"]').prop('checked', true);
                toggleFileSource();
                clearLangSelection();
                setTimeout(function() { loadTranslatedFiles(); loadSourceFiles(); }, 1000);
            } catch(err) {
                toastr.error(err.message || 'Translation failed');
            }
        }

        submitBtn.prop('disabled', false).html(originalHtml);
    });
});

// ─── File Source Toggle ───────────────────────────────────────────────────────

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

// ─── Source Files ─────────────────────────────────────────────────────────────

function loadSourceFiles() {
    $.ajax({
        url: 'api/get_source_files.php',
        type: 'GET',
        success: function(response) {
            try {
                const data = typeof response === 'string' ? JSON.parse(response) : response;
                if (data.success) populateSourceFilesDropdown(data.files);
            } catch(e) {
                console.error('Error loading source files:', e);
            }
        }
    });
}

function populateSourceFilesDropdown(files) {
    const select = $('#existing-file');
    select.empty().append('<option value="">Select a file...</option>');

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

    select.off('change').on('change', function() {
        const selected = $(this).find('option:selected');
        const project = selected.data('project');
        const topic = selected.data('topic');
        if (project) $('#project-name').val(project);
        if (topic) $('#topic-name').val(topic);
    });
}

// ─── Translated Files ─────────────────────────────────────────────────────────

function toggleShowHidden() {
    showHiddenMode = !showHiddenMode;
    const btn = document.getElementById('btn-show-hidden');
    if (showHiddenMode) {
        btn.classList.add('active');
        btn.title = 'Hide Hidden Items';
    } else {
        btn.classList.remove('active');
        btn.title = 'Show Hidden Items';
        hiddenProjectsList = [];
        hiddenTopicsList = [];
    }
    loadTranslatedFiles();
}

function loadTranslatedFiles() {
    const url = showHiddenMode ? 'api/get_files.php?show_hidden=1' : 'api/get_files.php';
    $.ajax({
        url: url,
        type: 'GET',
        success: function(response) {
            try {
                const data = typeof response === 'string' ? JSON.parse(response) : response;
                if (data.success) {
                    cachedFilesData = data.files;
                    hiddenProjectsList = (data.hidden_projects || []).map(function(p) { return p.toLowerCase(); });
                    hiddenTopicsList   = (data.hidden_topics   || []).map(function(t) { return t.toLowerCase(); });
                    populateProjectDropdown();
                    applyFilters();
                } else {
                    $('#files-container').html('<p class="loading">' + (data.message || 'No files found') + '</p>');
                }
            } catch(e) {
                $('#files-container').html('<p class="loading">Error loading files</p>');
            }
        },
        error: function() {
            $('#files-container').html('<p class="loading">Error loading files</p>');
        }
    });
}

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

function onProjectFilterChange() {
    populateTopicDropdown();
    applyFilters();
}

function applyFilters() {
    if (!cachedFilesData) return;

    const projectFilter = $('#filter-project').val() || '';
    const topicFilter   = $('#filter-topic').val() || '';
    const fileFilter    = ($('#filter-file').val() || '').toLowerCase().trim();

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
            if (filteredFiles.length > 0) filteredTopics[topic] = filteredFiles;
        }
        if (Object.keys(filteredTopics).length > 0) filtered[project] = filteredTopics;
    }

    displayFiles(filtered);
}

// ─── Display Files ────────────────────────────────────────────────────────────

// Extract the original doc name by stripping _LANGCODE_TIMESTAMP or _MULTI_TIMESTAMP from the end
function getBaseFileName(filename) {
    return filename
        .replace(/\.docx$/i, '')
        .replace(/_([A-Z]{2}(-[A-Z]{2})?|MULTI)_\d+$/, '');
}

function displayFiles(files) {
    if (!files || Object.keys(files).length === 0) {
        $('#files-container').html('<p class="loading">No translated files yet</p>');
        return;
    }

    let html = '';

    for (const project in files) {
        const projectHidden = hiddenProjectsList.includes(project.toLowerCase());
        html += '<div class="project-group' + (projectHidden ? ' is-hidden' : '') + '">';
        html += '<div class="project-title">';
        html += '<span>' + escapeHtml(project) + '</span>';
        if (projectHidden) {
            html += '<span class="hidden-badge"><i class="fas fa-eye-slash"></i> hidden</span>';
            html += '<button style="margin-left:8px;background:#27ae60;color:white;border:none;border-radius:3px;padding:2px 8px;font-size:11px;cursor:pointer;" onclick="unhideItem(\'project\', \'' + escapeHtml(project) + '\')" title="Unhide project"><i class="fas fa-eye"></i></button>';
        } else {
            html += '<button style="margin-left:8px;background:#95a5a6;color:white;border:none;border-radius:3px;padding:2px 8px;font-size:11px;cursor:pointer;" onmouseover="this.style.background=\'#e74c3c\'" onmouseout="this.style.background=\'#95a5a6\'" onclick="hideItem(\'project\', \'' + escapeHtml(project) + '\')" title="Hide project"><i class="fas fa-eye-slash"></i></button>';
        }
        html += '</div>';

        for (const topic in files[project]) {
            const topicFiles = files[project][topic];
            const topicHidden = hiddenTopicsList.includes(topic.toLowerCase());

            html += '<div class="topic-group' + (topicHidden ? ' is-hidden' : '') + '">';
            html += '<div class="topic-title">';
            html += '<span>' + escapeHtml(topic) + '</span>';
            if (topicHidden) {
                html += '<span class="hidden-badge"><i class="fas fa-eye-slash"></i> hidden</span>';
                html += '<button style="margin-left:8px;background:#27ae60;color:white;border:none;border-radius:3px;padding:2px 8px;font-size:11px;cursor:pointer;" onclick="unhideItem(\'topic\', \'' + escapeHtml(topic) + '\')" title="Unhide topic"><i class="fas fa-eye"></i></button>';
            } else {
                html += '<button style="margin-left:8px;background:#95a5a6;color:white;border:none;border-radius:3px;padding:2px 8px;font-size:11px;cursor:pointer;" onmouseover="this.style.background=\'#e74c3c\'" onmouseout="this.style.background=\'#95a5a6\'" onclick="hideItem(\'topic\', \'' + escapeHtml(topic) + '\')" title="Hide topic"><i class="fas fa-eye-slash"></i></button>';
            }
            html += '</div>';

            // Group files by source document (base name without lang+timestamp)
            const docGroups = {};
            topicFiles.forEach(function(file) {
                const base = getBaseFileName(file.name);
                if (!docGroups[base]) docGroups[base] = [];
                docGroups[base].push(file);
            });

            for (const baseName in docGroups) {
                const docFiles = docGroups[baseName];

                // Count files per language within this doc
                const langCounts = {};
                docFiles.forEach(function(f) {
                    langCounts[f.language] = (langCounts[f.language] || 0) + 1;
                });
                const langs = Object.keys(langCounts).sort();
                const langCount = langs.length;

                html += '<div class="doc-group">';
                html += '<div class="doc-group-header">';
                html += '<i class="fas fa-file-word doc-icon"></i>';
                html += '<span class="doc-group-name">' + escapeHtml(baseName) + '</span>';
                html += '<span class="doc-lang-badge">' + langCount + ' language' + (langCount !== 1 ? 's' : '') + '</span>';
                html += '</div>';

                // Language tabs — only when 2+ languages for this doc
                if (langCount > 1) {
                    html += '<div class="lang-tabs-bar">';
                    html += '<button class="lang-tab active" onclick="switchLangTab(this, \'all\')">All (' + docFiles.length + ')</button>';
                    langs.forEach(function(lang) {
                        html += '<button class="lang-tab" onclick="switchLangTab(this, \'' + escapeHtml(lang) + '\')">' + escapeHtml(getLanguageName(lang)) + ' (' + langCounts[lang] + ')</button>';
                    });
                    html += '</div>';
                }

                // File items
                docFiles.forEach(function(file) {
                    html += '<div class="file-item" data-lang="' + escapeHtml(file.language) + '">';
                    html += '<input type="checkbox" class="file-checkbox" data-path="' + escapeHtml(file.path) + '">';
                    html += '<div class="file-info">';
                    html += '<div class="file-name">' + escapeHtml(getLanguageName(file.language)) + '</div>';
                    html += '<div class="file-meta">' + escapeHtml(file.date) + '</div>';
                    html += '</div>';
                    html += '<div class="file-actions">';
                    html += '<button class="icon-btn btn-download-file" onclick="downloadFile(\'' + escapeHtml(file.path) + '\')" title="Download"><i class="fas fa-download"></i></button>';
                    html += '<button class="icon-btn btn-delete-file" onclick="deleteSingleFile(\'' + escapeHtml(file.path) + '\')" title="Delete"><i class="fas fa-trash"></i></button>';
                    html += '</div>';
                    html += '</div>';
                });

                html += '</div>'; // doc-group
            }

            html += '</div>'; // topic-group
        }

        html += '</div>'; // project-group
    }

    $('#files-container').html(html);
}

// Switch visible language tab within a doc group
function switchLangTab(btn, lang) {
    const tabsBar = $(btn).closest('.lang-tabs-bar');
    tabsBar.find('.lang-tab').removeClass('active');
    $(btn).addClass('active');

    const docGroup = tabsBar.closest('.doc-group');
    if (lang === 'all') {
        docGroup.find('.file-item').show();
    } else {
        docGroup.find('.file-item').hide();
        docGroup.find('.file-item[data-lang="' + lang + '"]').show();
    }
}

// ─── Hide / Unhide ────────────────────────────────────────────────────────────

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
                html += '<div class="hidden-item"><span>' + escapeHtml(p) + '</span>';
                html += '<button class="icon-btn btn-unhide" onclick="unhideItem(\'project\', \'' + escapeHtml(p) + '\')" title="Unhide"><i class="fas fa-eye"></i></button></div>';
            });
        }
        if (topics.length > 0) {
            html += '<div class="hidden-section-title">Hidden Topics</div>';
            topics.forEach(function(t) {
                html += '<div class="hidden-item"><span>' + escapeHtml(t) + '</span>';
                html += '<button class="icon-btn btn-unhide" onclick="unhideItem(\'topic\', \'' + escapeHtml(t) + '\')" title="Unhide"><i class="fas fa-eye"></i></button></div>';
            });
        }
    }

    $('#hidden-items-list').html(html);
}

// ─── Download / Delete ────────────────────────────────────────────────────────

function downloadFile(path) {
    window.open('api/download.php?file=' + encodeURIComponent(path), '_blank');
}

function deleteSingleFile(path) {
    if (!confirm('Are you sure you want to delete this file? This action cannot be undone.')) return;

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
            } catch(e) {
                toastr.error('Error processing response');
            }
        },
        error: function() { toastr.error('Failed to delete file'); }
    });
}

function bulkDownload() {
    const selected = getSelectedFiles();
    if (selected.length === 0) { toastr.warning('Please select files to download'); return; }

    toastr.info('Preparing download for ' + selected.length + ' file(s)...');

    if (selected.length === 1) {
        window.open('api/download.php?file=' + encodeURIComponent(selected[0]), '_blank');
    } else {
        $.ajax({
            url: 'api/bulk_download.php',
            type: 'POST',
            data: JSON.stringify({ files: selected }),
            contentType: 'application/json',
            xhrFields: { responseType: 'blob' },
            success: function(blob) {
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
            error: function() { toastr.error('Failed to download files'); }
        });
    }
}

function bulkDelete() {
    const selected = getSelectedFiles();
    if (selected.length === 0) { toastr.warning('Please select files to delete'); return; }
    if (!confirm('Are you sure you want to delete ' + selected.length + ' file(s)? This action cannot be undone.')) return;

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
            } catch(e) {
                toastr.error('Error processing response');
            }
        },
        error: function() { toastr.error('Failed to delete files'); }
    });
}

// ─── Logs ─────────────────────────────────────────────────────────────────────

function toggleLogViewer() {
    const logViewer = $('#log-viewer');
    if (logViewer.is(':visible')) {
        logViewer.fadeOut(300);
    } else {
        logViewer.fadeIn(300);
        refreshLogs();
    }
}

function refreshLogs() {
    const lines = $('#log-lines').val() || 100;
    $('#log-content').html('<p class="loading">Loading logs...</p>');

    $.ajax({
        url: 'api/get_logs.php?lines=' + lines,
        type: 'GET',
        success: function(response) {
            try {
                const data = typeof response === 'string' ? JSON.parse(response) : response;
                if (data.success) displayLogs(data.logs, data.total_lines);
                else $('#log-content').html('<p class="error">Error: ' + escapeHtml(data.message) + '</p>');
            } catch(e) {
                $('#log-content').html('<p class="error">Error parsing logs</p>');
            }
        },
        error: function() {
            $('#log-content').html('<p class="error">Error loading logs</p>');
        }
    });
}

function displayLogs(logs, totalLines) {
    if (!logs || logs.length === 0) {
        $('#log-content').html('<p class="empty">No logs available</p>');
        return;
    }

    let html = '<div class="log-info">Showing ' + logs.length + ' of ' + totalLines + ' total lines</div>';
    html += '<div class="log-entries">';
    logs.forEach(function(log) {
        const logClass = log.includes('SUCCESS') ? 'log-success' :
                         log.includes('FAILED')  ? 'log-error' :
                         log.includes('DELETED') ? 'log-warning' : '';
        html += '<div class="log-entry ' + logClass + '">' + escapeHtml(log) + '</div>';
    });
    html += '</div>';
    $('#log-content').html(html);
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getSelectedFiles() {
    const selected = [];
    $('.file-checkbox:checked').each(function() { selected.push($(this).data('path')); });
    return selected;
}

function escapeHtml(text) {
    const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' };
    return String(text).replace(/[&<>"']/g, function(m) { return map[m]; });
}
