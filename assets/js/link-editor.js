let customLinkMapper  = null;
let debounceTimer     = null;
let cleanSpansEnabled = false;
let quillLeft         = null;
let quillRight        = null;
let resolvedOverrides = {};
let pendingConflicts  = {};

const LINK_EDITOR_LANGUAGES = [
    { code: 'en',    name: 'English'              },
    { code: 'da',    name: 'Danish'               },
    { code: 'nl',    name: 'Dutch'                },
    { code: 'et',    name: 'Estonian'             },
    { code: 'fi',    name: 'Finnish'              },
    { code: 'de',    name: 'German'               },
    { code: 'is',    name: 'Icelandic'            },
    { code: 'lv',    name: 'Latvian'              },
    { code: 'no',    name: 'Norwegian'            },
    { code: 'ro',    name: 'Romanian'             },
    { code: 'ru',    name: 'Russian'              },
    { code: 'sv',    name: 'Swedish'              },
    { code: 'ar',    name: 'Arabic'               },
    { code: 'bg',    name: 'Bulgarian'            },
    { code: 'ca',    name: 'Catalan'              },
    { code: 'zh',    name: 'Chinese (Simplified)' },
    { code: 'hr',    name: 'Croatian'             },
    { code: 'cs',    name: 'Czech'                },
    { code: 'fr',    name: 'French'               },
    { code: 'el',    name: 'Greek'                },
    { code: 'he',    name: 'Hebrew'               },
    { code: 'hu',    name: 'Hungarian'            },
    { code: 'it',    name: 'Italian'              },
    { code: 'lt',    name: 'Lithuanian'           },
    { code: 'pl',    name: 'Polish'               },
    { code: 'pt',    name: 'Portuguese'           },
    { code: 'es',    name: 'Spanish'              },
    { code: 'tr',    name: 'Turkish'              },
    { code: 'uk',    name: 'Ukrainian'            },
];

const SUPPORTED_LINK_LANGS = new Set(['en','da','nl','et','fi','de','is','lv','no','ro','ru','sv']);

const QUILL_TOOLBAR = [
    [{ font: [] },  { size: ['small', false, 'large', 'huge'] }],
    [{ header: [1, 2, 3, 4, 5, 6, false] }],
    ['bold', 'italic', 'underline', 'strike'],
    [{ color: [] }, { background: [] }],
    [{ script: 'sub' }, { script: 'super' }],
    [{ list: 'ordered' }, { list: 'bullet' }, { list: 'check' }],
    [{ indent: '-1' }, { indent: '+1' }, { align: [] }],
    [{ direction: 'rtl' }],
    ['link', 'blockquote', 'code-block'],
    ['clean'],
];

// ---------------------------------------------------------------------------
// Init

$(document).ready(function () {
    // Left editor — full write access
    quillLeft = new Quill('#editor-left', {
        theme: 'snow',
        modules: { toolbar: QUILL_TOOLBAR, clipboard: { matchVisual: false } },
        placeholder: 'Paste or type HTML content here…',
    });

    // Right editor — preview (editable for manual tweaks)
    quillRight = new Quill('#editor-right', {
        theme: 'snow',
        modules: { toolbar: QUILL_TOOLBAR, clipboard: { matchVisual: false } },
        placeholder: 'Link preview will appear here…',
    });

    // Populate language dropdown
    const $sel = $('#editor-language');
    LINK_EDITOR_LANGUAGES.forEach(({ code, name }) => {
        const flag = !SUPPORTED_LINK_LANGS.has(code) ? ' ⚑' : '';
        $sel.append(`<option value="${code}">${name}${flag}</option>`);
    });

    // Fetch mapper data fresh from server (avoids PHP opcache/encoding issues)
    $.getJSON('api/get_mapper_data.php', function (res) {
        window.DEFAULT_LINK_MAPPER = res.default || null;

        if (res.custom) {
            _applyMapper(res.custom, 'custom-link-mapper.json (saved)');
            $('#json-paste-area').val(JSON.stringify(res.custom, null, 2));
            switchMapperTab('paste');
        }
    });

    // Left editor change → debounced preview update + language detection
    quillLeft.on('text-change', function () {
        updateCounts();
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(function () {
            autoDetectLanguage();
            updatePreview();
        }, 400);
    });

    $('#editor-language').on('change', updatePreview);

    $('#base-file-input').on('change', function () {
        const file = this.files[0];
        if (file) loadBaseFile(file);
    });
});

// ---------------------------------------------------------------------------
// Language auto-detection

function autoDetectLanguage() {
    const text = quillLeft.getText().trim();
    if (text.length < 15) return; // too short to be reliable

    const detected = detectLang(text);
    if (detected && detected !== $('#editor-language').val()) {
        $('#editor-language').val(detected);
    }
}

function detectLang(text) {
    // Cyrillic → Russian
    if (/[а-яА-ЯёЁ]/.test(text)) return 'ru';

    // Icelandic-unique letters
    if (/[þðÞÐ]/.test(text)) return 'is';

    // Latvian-unique: macron/cedilla combos
    if (/[āēīūģķļņĀĒĪŪĢĶĻŅ]/.test(text)) return 'lv';

    // Estonian-unique: õ
    if (/[õÕ]/.test(text)) return 'et';

    // Romanian-unique: comma-below ș ț or â î
    if (/[șțȘȚ]/.test(text) || (/[âÂîÎ]/.test(text) && /[ăĂ]/.test(text))) return 'ro';

    // German-unique: ß
    if (/ß/.test(text)) return 'de';

    // Norwegian / Danish: ø or æ
    if (/[øØæÆ]/.test(text)) {
        const lc = text.toLowerCase();
        const daScore = (lc.match(/\b(af|eller|hvad|flyselskab|rejse|mistet|misset|glip|gå|få)\b/g) || []).length;
        const noScore = (lc.match(/\b(ikke|flyet|flyselskap|ombordstigning|reise|mistet)\b/g) || []).length;
        return noScore >= daScore ? 'no' : 'da';
    }

    // Swedish OR Danish — both use å; score by language-specific words
    if (/[åÅ]/.test(text)) {
        const lc = text.toLowerCase();
        const daScore = (lc.match(/\b(af|flyselskab|rejse|misset|glip|gå|få|hvad|det)\b/g) || []).length;
        const svScore = (lc.match(/\b(flyg|inte|av|eller|resan|flygning|inställt|avbokat|ersättning)\b/g) || []).length;
        return daScore > svScore ? 'da' : 'sv';
    }

    // Finnish: ä or ö (no å, no ø, no ß)
    if (/[äöÄÖ]/.test(text)) {
        const lc = text.toLowerCase();
        // German also has ä/ö/ü — check for German-typical words
        const deScore = (lc.match(/\b(flug|der|die|das|und|nicht|wurde|fluggesellschaft)\b/g) || []).length;
        const fiScore = (lc.match(/\b(lento|lend|pääsy|lenno|korvaus|viivästys)\b/g) || []).length;
        if (deScore > fiScore) return 'de';
        return 'fi';
    }

    // Dutch: common words (shares basic Latin with English)
    const lc = text.toLowerCase();
    const nlScore = (lc.match(/\b(van|de|het|een|vlucht|vluchten|vertraging|annulering)\b/g) || []).length;
    if (nlScore >= 2) return 'nl';

    return 'en';
}

// ---------------------------------------------------------------------------
// Preview

function updatePreview() {
    const content  = quillLeft.root.innerHTML;
    const language = $('#editor-language').val();

    if (quillLeft.getText().trim() === '') {
        showEmptyState();
        return;
    }

    setRightLoading(true);

    $.ajax({
        url: 'api/apply_links.php',
        method: 'POST',
        contentType: 'application/json',
        data: JSON.stringify({ content, language, link_mapper: customLinkMapper, overrides: resolvedOverrides }),
        success(res) {
            const rawHtml = res.html || '';
            $('#editor-right').data('raw-html', rawHtml);
            renderPreview(rawHtml);
            updateBadge(res.links_found || 0);
            if (res.conflicts && Object.keys(res.conflicts).length > 0) {
                showConflictModal(res.conflicts);
            }
        },
        error() {
            quillRight.root.innerHTML = '<p><em style="color:#e74c3c">Failed to apply links — check the console.</em></p>';
        },
        complete() { setRightLoading(false); },
    });
}

function renderPreview(rawHtml) {
    const html = cleanSpansEnabled ? applyCleanSpans(rawHtml) : rawHtml;
    quillRight.root.innerHTML = html || '';
}

function setRightLoading(on) {
    $('#editor-right').toggleClass('quill-loading', on);
}

function showEmptyState() {
    quillRight.setContents([{ insert: '\n' }]);
    $('#editor-right').removeData('raw-html');
    updateBadge(0);
}

function updateBadge(count) {
    const $b = $('#links-found-badge');
    $b.toggleClass('has-links', count > 0)
      .text(count > 0 ? count + (count === 1 ? ' link' : ' links') + ' found' : 'No links found');
}

// ---------------------------------------------------------------------------
// Span cleaner

function toggleCleanSpans() {
    cleanSpansEnabled = !cleanSpansEnabled;
    $('#btn-clean-spans').toggleClass('active', cleanSpansEnabled);
    const raw = $('#editor-right').data('raw-html');
    if (raw !== undefined) renderPreview(raw);
}

function applyCleanSpans(html) {
    const div = document.createElement('div');
    div.innerHTML = html;
    div.querySelectorAll('span').forEach(span => {
        while (span.firstChild) span.parentNode.insertBefore(span.firstChild, span);
        span.remove();
    });
    return div.innerHTML;
}

// ---------------------------------------------------------------------------
// Counts

function updateCounts() {
    const text  = quillLeft.getText();
    const chars = Math.max(0, text.length - 1); // Quill appends a trailing \n
    const words = text.trim() ? text.trim().split(/\s+/).length : 0;
    $('#char-count').text(chars.toLocaleString() + ' chars');
    $('#word-count').text(words.toLocaleString() + ' words');
}

// ---------------------------------------------------------------------------
// Base file (custom link mapper)

function _applyMapper(data, label) {
    customLinkMapper = data;
    $('#base-file-name').text(label);
    $('#base-file-icon').attr('class', 'fas fa-file-check');
    $('#btn-clear-mapper').show();
    // Keep the view panel in sync if it's open
    if ($('#current-json').is(':visible')) {
        $('#current-json-label').text(label);
        $('#current-json-pre').text(JSON.stringify(data, null, 2));
    }
}

function loadBaseFile(file) {
    const reader = new FileReader();
    reader.onload = function (e) {
        try {
            const parsed = JSON.parse(e.target.result);
            _applyMapper(parsed, escapeHtml(file.name));
            $('#upload-file-label').text(escapeHtml(file.name));
            updatePreview();
        } catch {
            alert('Invalid JSON file — must match the fixed-words-links.json format.');
            $('#base-file-input').val('');
            $('#upload-file-label').text('No file chosen');
        }
    };
    reader.readAsText(file);
}

function clearBaseFile() {
    customLinkMapper = null;
    $('#base-file-name').text('default (translation-links.json)');
    $('#base-file-icon').attr('class', 'fas fa-file-code');
    $('#btn-clear-mapper').hide();
    $('#base-file-input').val('');
    $('#upload-file-label').text('No file chosen');
    $('#json-paste-area').val('');
    $('#paste-hint').text('');
    // Remove the saved file from the server
    $.ajax({ url: 'api/save_link_mapper.php', method: 'DELETE' });
    updatePreview();
}

// ---------------------------------------------------------------------------
// Mapper tab switching

function switchMapperTab(tab) {
    const isUpload = tab === 'upload';
    $('#tab-upload').toggleClass('active', isUpload);
    $('#tab-paste').toggleClass('active', !isUpload);
    $('#mapper-upload-content').toggle(isUpload);
    $('#mapper-paste-content').toggle(!isUpload);
}

function applyPastedJson() {
    const raw = $('#json-paste-area').val().trim();
    if (!raw) return;

    let parsed;
    try {
        parsed = JSON.parse(raw);
    } catch {
        _pasteHint('✗ Invalid JSON', '#e74c3c', 'paste-error');
        return;
    }

    _applyMapper(parsed, 'custom-link-mapper.json (saved)');
    updatePreview();

    // Persist to server
    $.ajax({
        url: 'api/save_link_mapper.php',
        method: 'POST',
        contentType: 'application/json',
        data: JSON.stringify({ mapper: parsed }),
        success() { _pasteHint('✓ Saved to custom-link-mapper.json', '#27ae60', 'paste-success'); },
        error()   { _pasteHint('✓ Applied (server save failed)', '#e67e22', 'paste-success'); },
    });
}

function _pasteHint(msg, color, cls) {
    $('#paste-hint').text(msg).css('color', color);
    $('#json-paste-area').addClass(cls);
    setTimeout(() => {
        $('#json-paste-area').removeClass(cls);
        $('#paste-hint').text('');
    }, 2000);
}

// ---------------------------------------------------------------------------
// Sample

function toggleSample() {
    const visible = $('#sample-json').is(':visible');
    $('#sample-json').slideToggle(180);
    $('#btn-show-sample').html(
        (visible ? '<i class="fas fa-lightbulb"></i> Show' : '<i class="fas fa-lightbulb"></i> Hide')
        + ' sample format'
    );
}

function copySample() {
    navigator.clipboard.writeText($('#sample-json pre').text())
        .then(() => flashBtn('#btn-copy-sample'));
}

// ---------------------------------------------------------------------------
// Editor actions

// ---------------------------------------------------------------------------
// Source view toggle

const sourceMode = { left: false, right: false };

function toggleSource(side) {
    const quill    = side === 'left' ? quillLeft : quillRight;
    const $quill   = $('#editor-' + side);
    const $source  = $('#source-' + side);
    const $btn     = $('#btn-source-' + side);
    const isSource = sourceMode[side];

    if (isSource) {
        // Source → WYSIWYG: push edited HTML back into Quill
        const html = $source.val();
        quill.root.innerHTML = html;
        $source.hide();
        $quill.show();
        $btn.removeClass('active');
        sourceMode[side] = false;
        if (side === 'left') {
            updateCounts();
            updatePreview();
        }
    } else {
        // WYSIWYG → Source: show raw HTML
        const html = side === 'left'
            ? quill.root.innerHTML
            : ($('#editor-right').data('raw-html') || quill.root.innerHTML);
        $source.val(html);
        $quill.hide();
        $source.show();
        $btn.addClass('active');
        sourceMode[side] = true;
    }
}

// ---------------------------------------------------------------------------

function clearEditor() {
    if (quillLeft.getText().trim() && !confirm('Clear editor content?')) return;
    quillLeft.setContents([{ insert: '\n' }]);
    resolvedOverrides = {};
    updateCounts();
    showEmptyState();
}

function copyEditorContent() {
    const html = quillLeft.root.innerHTML;
    if (!html) return;
    navigator.clipboard.writeText(html).then(() => flashBtn('#btn-copy-content'));
}

function copyPreviewHtml() {
    const raw = $('#editor-right').data('raw-html');
    const current = (raw !== undefined && raw !== '') ? raw : quillRight.root.innerHTML;
    if (!current) return;
    const output = cleanSpansEnabled ? applyCleanSpans(current) : current;
    navigator.clipboard.writeText(output).then(() => flashBtn('#btn-copy-html'));
}

function copyLeftToRight() {
    const html = quillLeft.root.innerHTML;
    quillRight.root.innerHTML = html;
    $('#editor-right').data('raw-html', html);
    updateBadge(0);
}

function swapEditors() {
    const leftHtml  = quillLeft.root.innerHTML;
    const rightHtml = quillRight.root.innerHTML;
    quillLeft.root.innerHTML  = rightHtml;
    quillRight.root.innerHTML = leftHtml;
    updateCounts();
    updatePreview();
}

function flashBtn(selector) {
    const $btn = $(selector);
    $btn.addClass('btn-flash');
    setTimeout(() => $btn.removeClass('btn-flash'), 600);
}

// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Current / active mapper viewer

function toggleCurrentJson() {
    const $panel  = $('#current-json');
    const opening = !$panel.is(':visible');

    if (opening) {
        const active = customLinkMapper || window.DEFAULT_LINK_MAPPER;
        const label  = customLinkMapper
            ? $('#base-file-name').text()
            : 'translation-links.json (default)';
        $('#current-json-label').text(label);
        $('#current-json-pre').text(active ? JSON.stringify(active, null, 2) : '(no data)');
    }

    $panel.slideToggle(180);
    $('#btn-view-json').toggleClass('active', opening);
}

function copyCurrentJson() {
    const text = $('#current-json-pre').text();
    if (!text || text === '(no data)') return;
    navigator.clipboard.writeText(text).then(() => flashBtn('#btn-copy-current'));
}

function loadCurrentToEditor() {
    const active = customLinkMapper || window.DEFAULT_LINK_MAPPER;
    if (!active) return;
    $('#json-paste-area').val(JSON.stringify(active, null, 2));
    switchMapperTab('paste');
    // Scroll into view
    $('#json-paste-area')[0].scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    $('#json-paste-area').focus();
}

// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Edit current mapper — load into paste tab directly from the bar

function editCurrentMapper() {
    const active = customLinkMapper || window.DEFAULT_LINK_MAPPER;
    if (!active) {
        alert('No mapper data available yet — try reloading the page.');
        return;
    }
    $('#json-paste-area').val(JSON.stringify(active, null, 2));
    switchMapperTab('paste');
    $('#json-paste-area')[0].scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    $('#json-paste-area').focus();
}

// ---------------------------------------------------------------------------
// Save as default (overwrite translation-links.json)

function saveAsDefault() {
    const raw = $('#json-paste-area').val().trim();
    if (!raw) return;

    let parsed;
    try {
        parsed = JSON.parse(raw);
    } catch {
        _pasteHint('✗ Invalid JSON', '#e74c3c', 'paste-error');
        return;
    }

    if (!confirm('This will overwrite translation-links.json (the default mapper). Continue?')) return;

    $.ajax({
        url: 'api/save_default_mapper.php',
        method: 'POST',
        contentType: 'application/json',
        data: JSON.stringify({ mapper: parsed }),
        success() {
            window.DEFAULT_LINK_MAPPER = parsed;
            _pasteHint('✓ Saved to translation-links.json', '#27ae60', 'paste-success');
        },
        error() { _pasteHint('✗ Failed to save default', '#e74c3c', 'paste-error'); },
    });
}

// ---------------------------------------------------------------------------

function escapeHtml(str) {
    const d = document.createElement('div');
    d.appendChild(document.createTextNode(str));
    return d.innerHTML;
}

// ---------------------------------------------------------------------------
// Conflict resolution modal

function showConflictModal(conflicts) {
    if (!conflicts || Object.keys(conflicts).length === 0) return;
    pendingConflicts = conflicts;

    const $list = $('#conflict-list').empty();

    Object.entries(conflicts).forEach(([phrase, options]) => {
        const $row  = $('<div class="conflict-row">');
        const $head = $('<div class="conflict-phrase-row">');
        $head.append(`<span class="conflict-phrase-label">"${escapeHtml(phrase)}"</span>`);
        $head.append('<span class="conflict-unresolved-badge">Choose a link</span>');
        $row.append($head);

        const $opts = $('<div class="conflict-options">');
        options.forEach(opt => {
            const langName = LINK_EDITOR_LANGUAGES.find(l => l.code === opt.lang)?.name || opt.lang.toUpperCase();
            const $btn = $('<button class="conflict-option-btn">')
                .attr({
                    'data-phrase': phrase,
                    'data-url':    opt.url,
                    'data-term':   opt.term,
                    'data-lang':   opt.lang,
                })
                .html(
                    `<span class="conflict-lang-badge">${escapeHtml(opt.lang.toUpperCase())}</span>` +
                    `<span class="conflict-lang-name">${escapeHtml(langName)}</span>` +
                    `<span class="conflict-url">${escapeHtml(opt.url)}</span>`
                );

            $btn.on('click', function () {
                $(this).closest('.conflict-options').find('.conflict-option-btn').removeClass('selected');
                $(this).addClass('selected');
                $(this).closest('.conflict-row').find('.conflict-unresolved-badge')
                    .text('').addClass('hidden');
            });

            $opts.append($btn);
        });

        $row.append($opts);
        $list.append($row);
    });

    $('#conflict-modal').css('display', 'flex');
}

function closeConflictModal() {
    $('#conflict-modal').hide();
    pendingConflicts = {};
}

function applyConflictResolutions() {
    const selections = {};
    let missingSelection = false;

    $('#conflict-list .conflict-row').each(function () {
        const $selected = $(this).find('.conflict-option-btn.selected');
        if ($selected.length === 0) {
            missingSelection = true;
            $(this).find('.conflict-unresolved-badge').text('Please choose').removeClass('hidden');
            return;
        }
        const phrase = $selected.data('phrase');
        selections[phrase] = {
            url:  $selected.data('url'),
            term: $selected.data('term'),
            lang: $selected.data('lang'),
        };
    });

    if (missingSelection) return;

    Object.assign(resolvedOverrides, selections);

    // Set dropdown to the most-selected language from conflict resolutions
    const langCounts = {};
    Object.values(selections).forEach(s => { langCounts[s.lang] = (langCounts[s.lang] || 0) + 1; });
    const dominant = Object.entries(langCounts).sort((a, b) => b[1] - a[1])[0]?.[0];
    if (dominant) $('#editor-language').val(dominant);

    closeConflictModal();
    updatePreview();
}
