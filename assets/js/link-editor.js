let customLinkMapper      = null;
let debounceTimer         = null;
let cleanSpansEnabled     = false;
let quillLeft             = null;
let quillRight            = null;
let quillSource           = null;
let sourceModeActive      = false;
let resolvedOverrides     = {};
let pendingConflicts      = {};
let sourceParaData        = null; // [{idx, tag, preview, links:[{href,text}]}]
let languageManuallySet   = false; // true once user explicitly picks a language from the dropdown

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

// Register Calibri with Quill's font whitelist so it appears in the dropdown.
// Must run before any new Quill() calls.
const QuillFont = Quill.import('formats/font');
QuillFont.whitelist = ['calibri', 'serif', 'monospace'];
Quill.register(QuillFont, true);

const QUILL_TOOLBAR = [
    [{ font: ['calibri', 'serif', 'monospace'] },  { size: ['small', false, 'large', 'huge'] }],
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

    // Source editor — paste source HTML with links for paragraph analysis
    quillSource = new Quill('#editor-source', {
        theme: 'snow',
        modules: { toolbar: QUILL_TOOLBAR, clipboard: { matchVisual: false } },
        placeholder: 'Paste source HTML content that already has links…',
    });

    // Populate language dropdown
    const $sel = $('#editor-language');
    LINK_EDITOR_LANGUAGES.forEach(({ code, name }) => {
        const flag = !SUPPORTED_LINK_LANGS.has(code) ? ' ⚑' : '';
        $sel.append(`<option value="${code}">${name}${flag}</option>`);
    });

    // Fetch mapper data fresh from server — cache-busted so JSON changes are picked up immediately
    $.getJSON('api/get_mapper_data.php?_=' + Date.now(), function (res) {
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

    $('#editor-language').on('change', function () {
        languageManuallySet = true;
        updatePreview();
    });

    $('#base-file-input').on('change', function () {
        const file = this.files[0];
        if (file) loadBaseFile(file);
    });
});

// ---------------------------------------------------------------------------
// Language auto-detection

function autoDetectLanguage() {
    if (languageManuallySet) return; // respect user's explicit choice

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

    const lc = text.toLowerCase();

    // Danish: words that are distinctive even without special Scandinavian characters.
    // "gik" is uniquely Danish past tense (Norwegian writes "gikk" with double k).
    // Aviation-context words like "glip", "misset", "forsinkelse" are strong signals.
    if (/\bgik\b/.test(lc)) return 'da';
    const daPlainScore = (lc.match(/\b(glip|misset|forsinkelse|erstatning|flyselskab|kompensation|afgang|ankomst|flyvning)\b/g) || []).length;
    if (daPlainScore >= 1) return 'da';

    // Dutch: common words (shares basic Latin with English)
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

    // ── Source-content mode: paragraph-level link matching with fallback ─────────
    // Phase 1 — try the exact same block index as the source paragraph.
    // Phase 2 — if Phase 1 got 0 links (phrase not in that block), try blocks at
    //           ±1 … ±5 until PHP finds a match.  Prevents missed links when
    //           translated articles shift paragraph positions slightly.
    // Headings never receive links.
    if (sourceParaData && sourceParaData.some(p => p.links.length > 0)) {
        const mapper = customLinkMapper || window.DEFAULT_LINK_MAPPER;
        console.log('[LE] source-content mode — mapper loaded:', !!mapper,
            '| source paras with links:', sourceParaData.filter(p => p.links.length).length);

        if (mapper) {
            const div = document.createElement('div');
            div.innerHTML = content;
            const blockArray = Array.from(
                div.querySelectorAll('p, li, h1, h2, h3, h4, h5, h6, blockquote, td, th')
            );

            const tasks = [];
            sourceParaData.forEach(({ idx, links }) => {
                if (!links.length) return;
                // Do NOT filter by block type here — headings and missing blocks both
                // need tasks so Phase-2 fallback can find the phrase in a non-heading block.

                const paraMapper = {};
                const hrefToSrcPositions = {};

                links.forEach(({ href, relPos: srcRelPos }) => {
                    const match = findMapperTermForHref(href, mapper);
                    console.log('[LE]   src idx', idx, 'href', href, '→', match ? match.term + '/' + match.lang : 'NO MATCH');
                    if (!match) return;
                    const targetEntry = (mapper[match.term] || {})[language];
                    if (!targetEntry || !Array.isArray(targetEntry.translations)) return;
                    if (!paraMapper[match.term]) paraMapper[match.term] = {};
                    paraMapper[match.term][language] = targetEntry;
                    const targetUrl = targetEntry.link || href;
                    if (!hrefToSrcPositions[targetUrl]) hrefToSrcPositions[targetUrl] = [];
                    hrefToSrcPositions[targetUrl].push(srcRelPos);
                });

                if (Object.keys(paraMapper).length) tasks.push({ idx, paraMapper, hrefToSrcPositions });
            });

            console.log('[LE] tasks built:', tasks.length, '| target blocks:', blockArray.length);

            if (tasks.length > 0) {
                // Helper: apply PHP-returned block HTML into the live div.
                // Track the ORIGINAL block (not replacement) so Phase-2 sees it as used.
                const usedBlocks = new Set();
                function applyBlockHtml(block, html, hrefToSrcPositions) {
                    const filtered = filterLinksByPosition(html, hrefToSrcPositions);
                    const wrap = document.createElement('div');
                    wrap.innerHTML = filtered;
                    const newBlock = wrap.firstElementChild;
                    if (newBlock && block.parentNode) {
                        block.parentNode.replaceChild(newBlock, block);
                    }
                    usedBlocks.add(block);
                }

                function phpApply(blockEl, pMapper) {
                    return Promise.resolve($.ajax({
                        url: 'api/apply_links.php',
                        method: 'POST',
                        contentType: 'application/json',
                        data: JSON.stringify({ content: blockEl.outerHTML, language, link_mapper: pMapper }),
                    })).then(res => ({ html: res.html || '', linksFound: res.links_found || 0 }))
                       .catch(err => { console.error('[LE] phpApply error', err); return { html: '', linksFound: 0 }; });
                }

                setRightLoading(true);

                // Phase 1: skip undefined blocks (idx out of target range) and heading
                // blocks — both push directly to fallback so Phase 2 can find the phrase
                // in any non-heading block across the full target article.
                Promise.all(tasks.map(task => {
                    const b = blockArray[task.idx];
                    if (!b || /^h[1-6]$/i.test(b.tagName)) {
                        return Promise.resolve({ task, res: { html: '', linksFound: -1 } });
                    }
                    return phpApply(b, task.paraMapper).then(res => ({ task, res }));
                })).then(phase1Results => {
                    const needFallback = [];

                    phase1Results.forEach(({ task, res }) => {
                        const block = blockArray[task.idx];
                        if (res.linksFound === -1) {
                            console.log('[LE] phase1 idx', task.idx, ': heading/out-of-range → fallback');
                        } else {
                            console.log('[LE] phase1 idx', task.idx, ': linksFound =', res.linksFound);
                        }
                        if (res.linksFound > 0 && block && !usedBlocks.has(block)) {
                            applyBlockHtml(block, res.html, task.hrefToSrcPositions);
                        } else {
                            needFallback.push(task);
                        }
                    });

                    console.log('[LE] phase1 done — fallback queue:', needFallback.length);

                    // Phase 2 — nearby offsets (±1…±8), then ALL remaining blocks.
                    function nearbyOffsets(idx) {
                        const offs = [];
                        for (let d = 1; d <= 8; d++) { offs.push(-d, d); }
                        return offs.map(o => blockArray[idx + o]);
                    }

                    function runFallback(i) {
                        if (i >= needFallback.length) { finalize(); return; }
                        const task = needFallback[i];
                        const nearby  = nearbyOffsets(task.idx);
                        const allRest = blockArray.filter(b => !nearby.includes(b));
                        const candidates = [...nearby, ...allRest]
                            .filter(b => b && !/^h[1-6]$/i.test(b.tagName) && !usedBlocks.has(b));

                        console.log('[LE] fallback idx', task.idx, ': candidates =', candidates.length);

                        function tryCandidates(ci) {
                            if (ci >= candidates.length) { runFallback(i + 1); return; }
                            const block = candidates[ci];
                            phpApply(block, task.paraMapper).then(res => {
                                if (res.linksFound > 0) {
                                    applyBlockHtml(block, res.html, task.hrefToSrcPositions);
                                    runFallback(i + 1);
                                } else {
                                    tryCandidates(ci + 1);
                                }
                            });
                        }
                        tryCandidates(0);
                    }

                    function finalize() {
                        const rawHtml = div.innerHTML;
                        $('#editor-right').data('raw-html', rawHtml);
                        renderPreview(rawHtml);
                        updateBadge(countLinksInHtml(rawHtml));
                        setRightLoading(false);
                        console.log('[LE] finalize: total links in output =', countLinksInHtml(rawHtml));
                    }

                    runFallback(0);
                }).catch(err => { console.error('[LE] phase1 error', err); setRightLoading(false); });

                return; // only exit here — after async work is started
            }

            console.warn('[LE] 0 tasks — falling through to normal mode (URL mismatch or no translatable links)');
        } else {
            console.warn('[LE] mapper not loaded yet — falling through to normal mode');
        }
    }

    // ── Normal mode: use server-side link mapper ───────────────────────────────
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

function countLinksInHtml(html) {
    const d = document.createElement('div');
    d.innerHTML = html;
    return d.querySelectorAll('a[href]').length;
}

function removeHeadingLinks(html) {
    const d = document.createElement('div');
    d.innerHTML = html;
    d.querySelectorAll('h1,h2,h3,h4,h5,h6').forEach(h => {
        h.querySelectorAll('a').forEach(a => a.replaceWith(document.createTextNode(a.textContent)));
    });
    return d.innerHTML;
}

// PHP may link ALL occurrences of a translated phrase in a block.
// hrefToSrcPositions maps each target URL → array of source relPos values (one per
// source link that maps to that URL in this paragraph).
// We keep exactly that many occurrences, choosing the ones whose positions in the
// target block are closest to the source positions.  Extras are unwrapped.
function filterLinksByPosition(blockHtml, hrefToSrcPositions) {
    const wrap = document.createElement('div');
    wrap.innerHTML = blockHtml;

    Object.entries(hrefToSrcPositions).forEach(([targetUrl, srcPositions]) => {
        const anchors = Array.from(wrap.querySelectorAll('a[href]'))
            .filter(a => a.getAttribute('href') === targetUrl);

        if (anchors.length <= srcPositions.length) return; // nothing to trim

        const totalLen = wrap.textContent.length || 1;

        // Measure each anchor's relative position in the block
        const anchorInfos = anchors.map(a => {
            let charsBefore = 0;
            const walker = document.createTreeWalker(wrap, NodeFilter.SHOW_TEXT);
            let cur;
            while ((cur = walker.nextNode())) {
                if (a.contains(cur)) break;
                charsBefore += cur.textContent.length;
            }
            return { a, pos: charsBefore / totalLen };
        });

        // Greedy assignment: for each source position pick the closest unused anchor
        const keepSet = new Set();
        [...srcPositions].forEach(srcPos => {
            let best = null, bestDist = Infinity;
            anchorInfos.forEach(info => {
                if (keepSet.has(info.a)) return;
                const d = Math.abs(info.pos - srcPos);
                if (d < bestDist) { bestDist = d; best = info; }
            });
            if (best) keepSet.add(best.a);
        });

        // Unwrap the extra occurrences
        anchorInfos.forEach(({ a }) => {
            if (!keepSet.has(a)) a.replaceWith(document.createTextNode(a.textContent));
        });
    });

    return wrap.innerHTML;
}

function renderPreview(rawHtml) {
    const html = cleanSpansEnabled ? applyCleanSpans(rawHtml) : rawHtml;
    // Set innerHTML directly — dangerouslyPasteHTML triggers Quill's sanitizer
    // which strips class attributes from <a> tags. Direct innerHTML assignment
    // is then re-normalized by Quill's MutationObserver, but we handle the
    // class-stripping via CSS a[href] fallback rule in style.css.
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
    resolvedOverrides     = {};
    languageManuallySet   = false; // re-enable auto-detect for the next paste
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
// Source Content Analysis

function toggleSourceContent() {
    const $panel  = $('#source-content-panel');
    const opening = !$panel.is(':visible');
    $panel.slideToggle(180);
    $('#btn-show-source').toggleClass('active', opening);
}

function analyzeSource() {
    // If currently in raw-HTML source mode, sync content back to Quill first
    if (sourceModeActive) {
        quillSource.root.innerHTML = $('#source-view-raw').val();
    }

    if (quillSource.getText().trim() === '') {
        $('#source-analysis-output').html('<span class="source-analysis-hint">Nothing to analyze — paste source HTML first.</span>');
        return;
    }

    const html = quillSource.root.innerHTML;
    sourceParaData = parseSourceParagraphs(html);
    renderSourceAnalysis(sourceParaData);
    updateSourceBadge();

    // Refresh preview so source links are applied to target immediately
    if (quillLeft.getText().trim()) updatePreview();
}

function clearSource() {
    sourceParaData = null;
    quillSource.setContents([{ insert: '\n' }]);

    // Exit raw-source mode if active
    if (sourceModeActive) {
        $('#source-view-raw').val('').hide();
        $('#editor-source').show();
        $('#btn-source-toggle').removeClass('active');
        sourceModeActive = false;
    }

    $('#source-analysis-output').html(
        '<span class="source-analysis-hint">Paste source HTML above and click <strong>Analyze Links</strong> to see which paragraphs contain links.</span>'
    );
    updateSourceBadge();
    if (quillLeft.getText().trim()) updatePreview();
}

function toggleSourceView() {
    const $quill = $('#editor-source');
    const $raw   = $('#source-view-raw');
    const $btn   = $('#btn-source-toggle');

    if (sourceModeActive) {
        // Raw HTML → WYSIWYG
        quillSource.root.innerHTML = $raw.val();
        $raw.hide();
        $quill.show();
        $btn.removeClass('active');
        sourceModeActive = false;
    } else {
        // WYSIWYG → Raw HTML
        $raw.val(quillSource.root.innerHTML);
        $quill.hide();
        $raw.show();
        $btn.addClass('active');
        sourceModeActive = true;
    }
}

// Parse HTML into flat list of block elements with their links.
// Each link records `relPos` — the fraction (0–1) of block text that precedes it,
// used later to place the translated anchor at roughly the same position.
function parseSourceParagraphs(html) {
    const div = document.createElement('div');
    div.innerHTML = html;

    const blocks = div.querySelectorAll('p, li, h1, h2, h3, h4, h5, h6, blockquote, td, th');

    return Array.from(blocks).map((block, idx) => {
        const totalLen = block.textContent.length;

        const links = Array.from(block.querySelectorAll('a[href]')).map(a => {
            // Count text chars before this anchor to get its relative position
            let charsBefore = 0;
            const walker = document.createTreeWalker(block, NodeFilter.SHOW_TEXT);
            let cur;
            while ((cur = walker.nextNode())) {
                if (a.contains(cur)) break;
                charsBefore += cur.textContent.length;
            }
            return {
                href:   a.getAttribute('href') || '',
                text:   a.textContent.trim(),
                relPos: totalLen > 0 ? charsBefore / totalLen : 0,
            };
        }).filter(l => l.href && l.text);

        return {
            idx,
            tag:     block.tagName.toLowerCase(),
            preview: block.textContent.trim().substring(0, 70),
            links,
        };
    });
}

function renderSourceAnalysis(paras) {
    const withLinks = paras.filter(p => p.links.length > 0);
    const total     = withLinks.reduce((n, p) => n + p.links.length, 0);

    if (total === 0) {
        $('#source-analysis-output').html('<span class="source-analysis-hint">No &lt;a href&gt; links found in the pasted source HTML.</span>');
        return;
    }

    const mapper  = customLinkMapper || window.DEFAULT_LINK_MAPPER || {};
    const $output = $('#source-analysis-output').empty();

    $output.append(
        `<div class="source-analysis-summary">Found <strong>${total}</strong> link${total !== 1 ? 's' : ''} across <strong>${withLinks.length}</strong> paragraph${withLinks.length !== 1 ? 's' : ''} — matched paragraphs will be applied to the target when you click Refresh.</div>`
    );

    const $list = $('<div class="source-para-list">');

    withLinks.forEach(({ idx, tag, preview, links }) => {
        const $item = $('<div class="source-para-item">');
        const label = (tag === 'p' ? 'P' : tag.toUpperCase()) + (idx + 1);
        $item.append(`<span class="source-para-num" title="&lt;${tag}&gt; element #${idx + 1}">${escapeHtml(label)}</span>`);

        const $linkCol = $('<div class="source-para-links">');

        if (preview) {
            $linkCol.append(`<span class="source-para-preview">${escapeHtml(preview.substring(0, 55))}…</span>`);
        }

        links.forEach(({ href, text }) => {
            const match   = findMapperTermForHref(href, mapper);
            const tagHtml = match
                ? `<span class="source-link-tag matched" title="Mapper term: '${escapeHtml(match.term)}'"><i class="fas fa-check"></i> ${escapeHtml(match.term)}</span>`
                : `<span class="source-link-tag custom" title="URL not found in active link mapper — will be skipped"><i class="fas fa-triangle-exclamation"></i> custom</span>`;

            $linkCol.append(`
                <div class="source-link-item">
                    <span class="source-link-anchor" title="${escapeHtml(text)}">"${escapeHtml(text)}"</span>
                    <span class="source-link-arrow">→</span>
                    <span class="source-link-url" title="${escapeHtml(href)}">${escapeHtml(href)}</span>
                    ${tagHtml}
                </div>`);
        });

        $item.append($linkCol);
        $list.append($item);
    });

    $output.append($list);
    $('#source-links-count').text(`${total} link${total !== 1 ? 's' : ''} found`);
}

function updateSourceBadge() {
    const total = sourceParaData
        ? sourceParaData.reduce((n, p) => n + p.links.length, 0)
        : 0;

    if (total > 0) {
        $('#source-badge-mini').text(total).show();
        $('#btn-show-source').addClass('has-source');
        $('#source-links-count').text(`${total} link${total !== 1 ? 's' : ''} found`);
    } else {
        $('#source-badge-mini').hide();
        $('#btn-show-source').removeClass('has-source');
        $('#source-links-count').text('');
    }
}

// Normalise a URL for comparison: strip trailing slashes, lower-case the origin.
// This handles http vs https and www-prefix differences and trailing-slash mismatches.
function normaliseHref(url) {
    try {
        const u = new URL(url);
        return (u.hostname + u.pathname).toLowerCase().replace(/\/+$/, '');
    } catch {
        return url.toLowerCase().replace(/\/+$/, '');
    }
}

// Search mapper for a matching href (any language entry).
// Uses normalised comparison so trailing-slash / case differences don't break it.
function findMapperTermForHref(href, mapper) {
    if (!mapper || !href) return null;
    const norm = normaliseHref(href);
    for (const [term, langEntries] of Object.entries(mapper)) {
        if (!langEntries || typeof langEntries !== 'object') continue;
        for (const [lang, entry] of Object.entries(langEntries)) {
            if (entry && normaliseHref(entry.link || '') === norm) return { term, lang };
        }
    }
    return null;
}

// ---------------------------------------------------------------------------
// Source link transplant — paragraph-aligned, exact count
//
// Strategy:
//   - Source paragraph at index N had K links → apply exactly those K links to
//     target paragraph at index N only (no cross-paragraph fallback).
//   - Each link searches for its translated phrases (longest first) within the
//     target paragraph. The first non-overlapping match wins.
//   - If the phrase isn't found in that paragraph it is simply skipped.
//   - Links that have no mapper entry (shown as "custom" in the analysis panel)
//     are also skipped.
//
// Unicode: both the block text and phrases are NFC-normalised before comparison
// so that characters like å work regardless of how the pasted HTML was encoded.

function applySourceLinksToTarget(targetHtml, sourceParagraphs, language) {
    const mapper = customLinkMapper || window.DEFAULT_LINK_MAPPER;
    if (!mapper) return targetHtml;

    // paraIdx → [{url, phrases[]}]  one entry per source link, in source order
    const paraLinkLists = {};

    sourceParagraphs.forEach(({ idx, links }) => {
        if (!links.length) return;
        const list = [];

        links.forEach(({ href, text }) => {
            const match = findMapperTermForHref(href, mapper);
            if (!match) return;

            const termData    = mapper[match.term];
            const targetEntry = termData && termData[language];
            if (!targetEntry || !Array.isArray(targetEntry.translations)) return;

            const url = targetEntry.link || href;

            // Sort target phrases so the ones closest in word-count to the source
            // anchor come first (single-word anchor "miss" → try "glip" before
            // "gået glip af"), then break ties with length (longer first for
            // better specificity within the same word-count tier).
            const srcWords = (text || '').trim().split(/\s+/).length;
            const phrases = targetEntry.translations
                .slice()
                .sort((a, b) => {
                    const aW = a.trim().split(/\s+/).length;
                    const bW = b.trim().split(/\s+/).length;
                    const diff = Math.abs(aW - srcWords) - Math.abs(bW - srcWords);
                    if (diff !== 0) return diff;        // closer word-count wins
                    return b.length - a.length;         // longer wins in same tier
                })
                .map(p => p.toLowerCase().normalize('NFC'));

            list.push({ url, phrases });
        });

        if (list.length) paraLinkLists[idx] = list;
    });

    if (!Object.keys(paraLinkLists).length) return targetHtml;

    const div     = document.createElement('div');
    div.innerHTML = targetHtml;

    const blockArray = Array.from(
        div.querySelectorAll('p, li, h1, h2, h3, h4, h5, h6, blockquote, td, th')
    );

    Object.entries(paraLinkLists).forEach(([idxStr, linkList]) => {
        const idx   = parseInt(idxStr, 10);
        const block = blockArray[idx];
        if (!block) return; // target has fewer blocks than source — skip

        // NFC-normalise the block text so accented chars always compare correctly
        const blockText = collectTextContent(block);
        const lc        = blockText.toLowerCase().normalize('NFC');
        const usedUrls  = new Set();

        const matches = [];

        linkList.forEach(({ url, phrases }) => {
            if (usedUrls.has(url)) return;

            // Try phrases from longest to shortest; break only on a successful add.
            // If the longest phrase overlaps an already-claimed range we fall through
            // to the next shorter phrase instead of giving up immediately.
            for (const phrase of phrases) {
                const pos = lc.indexOf(phrase);
                if (pos === -1) continue; // phrase not in this block — try shorter

                const overlaps = matches.some(
                    m => pos < m.end && pos + phrase.length > m.start
                );
                if (overlaps) continue; // overlaps existing match — try shorter phrase

                matches.push({ start: pos, end: pos + phrase.length, url });
                usedUrls.add(url);
                break; // phrase placed — move to next link
            }
        });

        if (!matches.length) return;

        matches.sort((a, b) => a.start - b.start);
        injectLinksIntoBlock(block, matches, blockText);
    });

    return div.innerHTML;
}

// Returns the concatenated text of all text nodes that are NOT inside existing <a> tags,
// which is the same text we'll walk when injecting links.
function collectTextContent(block) {
    const walker = document.createTreeWalker(block, NodeFilter.SHOW_TEXT, {
        acceptNode(node) {
            let el = node.parentElement;
            while (el && el !== block) {
                if (el.tagName === 'A') return NodeFilter.FILTER_REJECT;
                el = el.parentElement;
            }
            return NodeFilter.FILTER_ACCEPT;
        },
    });
    let text = '', cur;
    while ((cur = walker.nextNode())) text += cur.textContent;
    return text;
}

// Walk text nodes (skipping existing <a> tags), collect them with cumulative offsets,
// then inject <a> elements at the positions described by `matches`.
function injectLinksIntoBlock(block, matches, fullText) {
    // Collect text nodes with their start offset in fullText
    const nodeRanges = [];
    let offset = 0;

    const walker = document.createTreeWalker(block, NodeFilter.SHOW_TEXT, {
        acceptNode(node) {
            let el = node.parentElement;
            while (el && el !== block) {
                if (el.tagName === 'A') return NodeFilter.FILTER_REJECT;
                el = el.parentElement;
            }
            return NodeFilter.FILTER_ACCEPT;
        },
    });

    let cur;
    while ((cur = walker.nextNode())) {
        nodeRanges.push({ node: cur, start: offset, end: offset + cur.textContent.length });
        offset += cur.textContent.length;
    }

    // Map each match to a text node and local offset
    // Group by node so we can process each node's matches together
    const nodeMatchMap = new Map(); // textNode → [{localStart, localEnd, url}]

    matches.forEach(({ start, end, url }) => {
        // Find the node that fully contains this match
        const nr = nodeRanges.find(r => r.start <= start && r.end >= end);
        if (!nr) return;

        if (!nodeMatchMap.has(nr.node)) nodeMatchMap.set(nr.node, []);
        nodeMatchMap.get(nr.node).push({
            localStart: start - nr.start,
            localEnd:   end   - nr.start,
            url,
        });
    });

    // Replace each affected text node with a fragment containing <a> tags
    nodeMatchMap.forEach((nodeMatches, textNode) => {
        nodeMatches.sort((a, b) => a.localStart - b.localStart);

        const text = textNode.textContent;
        const frag = document.createDocumentFragment();
        let last = 0;

        nodeMatches.forEach(({ localStart, localEnd, url }) => {
            if (localStart < last) return; // overlapping — skip
            if (localStart > last) frag.appendChild(document.createTextNode(text.slice(last, localStart)));

            const a = document.createElement('a');
            a.href      = url;
            a.target    = '_blank';
            a.className = 'detected-link';
            a.textContent = text.slice(localStart, localEnd);
            frag.appendChild(a);
            last = localEnd;
        });

        if (last < text.length) frag.appendChild(document.createTextNode(text.slice(last)));
        textNode.parentNode.replaceChild(frag, textNode);
    });
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
