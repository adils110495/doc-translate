<?php
header('Content-Type: application/json');

$input        = json_decode(file_get_contents('php://input'), true);
$content      = $input['content']     ?? '';
$language     = strtolower(trim($input['language'] ?? 'en'));
$customMapper = $input['link_mapper'] ?? null;
$overrides    = is_array($input['overrides'] ?? null) ? $input['overrides'] : [];

if (!$content) {
    echo json_encode(['html' => '', 'links_found' => 0, 'conflicts' => []]);
    exit;
}

if (strpos($language, '-') !== false) $language = explode('-', $language)[0];
if ($language === 'nb') $language = 'no';

$linksMap = is_array($customMapper) ? $customMapper : [];
if (empty($linksMap)) {
    $linksFile = dirname(__DIR__) . '/translation-links.json';
    $linksMap  = file_exists($linksFile)
        ? (json_decode(file_get_contents($linksFile), true) ?? [])
        : [];
}

// ── Build full cross-language conflict map ───────────────────────────────────
// phrase (lower) → [ lang → { url, term, lang } ]
$phraseConflictsMap = [];
foreach ($linksMap as $term => $langEntries) {
    if (!is_array($langEntries)) continue;
    foreach ($langEntries as $lang => $entry) {
        $url     = $entry['link'] ?? null;
        $phrases = $entry['translations'] ?? [];
        if (!$url || !is_array($phrases)) continue;
        foreach ($phrases as $phrase) {
            $lower = mb_strtolower($phrase, 'UTF-8');
            if (!isset($phraseConflictsMap[$lower][$lang])) {
                $phraseConflictsMap[$lower][$lang] = ['url' => $url, 'term' => $term, 'lang' => $lang];
            }
        }
    }
}

// ── Build termToUrl for selected language ────────────────────────────────────
$termToUrl = [];
foreach ($linksMap as $term => $langEntries) {
    if (!is_array($langEntries)) continue;
    $langsToProcess = ($language === 'auto') ? array_keys($langEntries) : [$language];
    foreach ($langsToProcess as $lang) {
        if (!isset($langEntries[$lang])) continue;
        $entry   = $langEntries[$lang];
        $url     = $entry['link'] ?? null;
        $phrases = $entry['translations'] ?? [];
        if (!$url || !is_array($phrases)) continue;
        foreach ($phrases as $phrase) {
            $lower = mb_strtolower($phrase, 'UTF-8');
            if (!isset($termToUrl[$lower])) {
                $termToUrl[$lower] = ['url' => $url, 'term' => $term];
            }
        }
    }
}

// ── Ensure cross-language conflict phrases are always matchable ───────────────
// If a phrase exists in 2+ languages but wasn't added by the selected language,
// add it using any available language so it still gets matched and reported.
foreach ($phraseConflictsMap as $phrase => $langs) {
    if (count($langs) > 1 && !isset($termToUrl[$phrase])) {
        $first = reset($langs);
        $termToUrl[$phrase] = ['url' => $first['url'], 'term' => $first['term']];
    }
}

// ── Apply user-resolved overrides ────────────────────────────────────────────
foreach ($overrides as $phrase => $choice) {
    $lower = mb_strtolower($phrase, 'UTF-8');
    if (!empty($choice['url'])) {
        $termToUrl[$lower] = ['url' => $choice['url'], 'term' => $choice['term'] ?? ''];
    }
}

// Longest phrase first
uksort($termToUrl, fn($a, $b) => mb_strlen($b, 'UTF-8') - mb_strlen($a, 'UTF-8'));

// ── Process content ───────────────────────────────────────────────────────────
$linksFound    = 0;
$matchedPhrases = [];
$isHtml = (bool) preg_match('/<[a-zA-Z][^>]*>/', $content);
$html   = $isHtml
    ? applyLinksToHtml($content, $termToUrl, $linksFound, $matchedPhrases)
    : processContent($content, $termToUrl, $linksFound, $matchedPhrases);

// ── Collect conflicts for matched phrases (skip already-resolved ones) ────────
$conflicts = [];
foreach (array_keys($matchedPhrases) as $phrase) {
    if (isset($overrides[$phrase])) continue;
    if (isset($phraseConflictsMap[$phrase]) && count($phraseConflictsMap[$phrase]) > 1) {
        $conflicts[$phrase] = array_values($phraseConflictsMap[$phrase]);
    }
}

echo json_encode(['html' => $html, 'links_found' => $linksFound, 'conflicts' => $conflicts]);

// ── HTML-aware processor ──────────────────────────────────────────────────────

function applyLinksToHtml(string $html, array $termToUrl, int &$linksFound, array &$matchedPhrases): string {
    if (empty($termToUrl)) return $html;

    $result   = '';
    $lastEnd  = 0;
    $len      = strlen($html);
    $inAnchor = false;

    preg_match_all('/<(?:"[^"]*"|\'[^\']*\'|[^"\'>])*>/s', $html, $tagMatches, PREG_OFFSET_CAPTURE);

    foreach ($tagMatches[0] as [$tagText, $tagPos]) {
        if ($tagPos > $lastEnd) {
            $chunk   = substr($html, $lastEnd, $tagPos - $lastEnd);
            $result .= (!$inAnchor && trim($chunk) !== '')
                ? applyLinksToLine($chunk, $termToUrl, $linksFound, $matchedPhrases)
                : $chunk;
        }
        $result .= $tagText;
        if (preg_match('/^<a[\s>]/i', $tagText))      $inAnchor = true;
        elseif (preg_match('/^<\/a\s*>/i', $tagText)) $inAnchor = false;
        $lastEnd = $tagPos + strlen($tagText);
    }

    if ($lastEnd < $len) {
        $chunk   = substr($html, $lastEnd);
        $result .= (!$inAnchor && trim($chunk) !== '')
            ? applyLinksToLine($chunk, $termToUrl, $linksFound, $matchedPhrases)
            : $chunk;
    }

    return $result;
}

function processContent(string $content, array $termToUrl, int &$linksFound, array &$matchedPhrases): string {
    $paragraphs = preg_split('/\n{2,}/', $content);
    $parts = [];
    foreach ($paragraphs as $para) {
        if (trim($para) === '') continue;
        $lines = explode("\n", $para);
        $processedLines = [];
        foreach ($lines as $line) {
            $processedLines[] = applyLinksToLine($line, $termToUrl, $linksFound, $matchedPhrases);
        }
        $parts[] = '<p>' . implode('<br>', $processedLines) . '</p>';
    }
    return implode("\n", $parts);
}

function applyLinksToLine(string $line, array $termToUrl, int &$linksFound, array &$matchedPhrases): string {
    if (empty($termToUrl) || trim($line) === '') return htmlspecialchars($line);

    $patterns = array_map(fn($p) => preg_quote($p, '/'), array_keys($termToUrl));
    $pattern  = '/(' . implode('|', $patterns) . ')/iu';

    // Use PREG_OFFSET_CAPTURE with the u-flag: PHP returns BYTE offsets even for Unicode
    // patterns, so we convert to character offsets to avoid skipping matches that follow
    // multibyte characters (e.g. "glip" after the å in "gået").
    if (!preg_match_all($pattern, $line, $matches, PREG_OFFSET_CAPTURE)) {
        return htmlspecialchars($line);
    }

    $result  = '';
    $lastEnd = 0; // character offset

    foreach ($matches[0] as $match) {
        [$matchText, $bytePos] = $match;
        // Convert byte offset → character offset
        $matchPos = mb_strlen(substr($line, 0, $bytePos), 'UTF-8');
        $matchLen = mb_strlen($matchText, 'UTF-8');

        if ($matchPos < $lastEnd) continue;

        $result .= htmlspecialchars(mb_substr($line, $lastEnd, $matchPos - $lastEnd, 'UTF-8'));

        $key = mb_strtolower($matchText, 'UTF-8');
        if (isset($termToUrl[$key])) {
            $linksFound++;
            $matchedPhrases[$key] = true;
            $url    = htmlspecialchars($termToUrl[$key]['url']);
            $result .= '<a href="' . $url . '" target="_blank" class="detected-link">'
                     . htmlspecialchars($matchText) . '</a>';
        } else {
            $result .= htmlspecialchars($matchText);
        }

        $lastEnd = $matchPos + $matchLen;
    }

    return $result . htmlspecialchars(mb_substr($line, $lastEnd, null, 'UTF-8'));
}
