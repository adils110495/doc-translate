<?php
require_once __DIR__ . '/config.php';
require_once __DIR__ . '/logger.php';

/**
 * Document Translator
 * Translates DOCX documents using DeepL API while preserving layout and formatting
 * Uses paragraph-level translation for better context
 * Applies bold formatting and hyperlinks to fixed words and airline names
 */
class DocumentTranslator {

    private $deeplApiKey;
    private $deeplApiUrl;
    private $translator;
    private $fixedWords = [];
    private $fixedWordsLinks = [];
    private $airlinesLinks = [];
    private $relationshipId = 1000;

    public function __construct() {
        $this->loadComposerAutoloader();
        $this->loadEnv();
        $this->loadFixedWords();
        $this->loadFixedWordsLinks();
        $this->loadAirlinesLinks();

        $this->deeplApiKey = getenv('DEEPL_API_KEY');
        $this->deeplApiUrl = getenv('DEEPL_API_URL') ?: 'https://api-free.deepl.com';

        if ($this->deeplApiKey && class_exists('DeepL\Translator')) {
            try {
                $options = [];
                if (strpos($this->deeplApiUrl, 'api-free.deepl.com') !== false) {
                    $options['server_url'] = 'https://api-free.deepl.com';
                }
                $this->translator = new \DeepL\Translator($this->deeplApiKey, $options);
            } catch (Exception $e) {
                error_log('DeepL Translator initialization failed: ' . $e->getMessage());
                $this->translator = null;
            }
        }
    }

    private function loadComposerAutoloader() {
        $autoloadPaths = [
            dirname(__DIR__) . '/vendor/autoload.php',
            dirname(dirname(__DIR__)) . '/vendor/autoload.php',
        ];
        foreach ($autoloadPaths as $path) {
            if (file_exists($path)) {
                require_once $path;
                return;
            }
        }
    }

    private function loadEnv() {
        $envFile = dirname(__DIR__) . '/.env';
        if (file_exists($envFile)) {
            $lines = file($envFile, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);
            foreach ($lines as $line) {
                if (strpos(trim($line), '#') === 0) continue;
                if (strpos($line, '=') !== false) {
                    list($key, $value) = explode('=', $line, 2);
                    $key = trim($key);
                    $value = trim($value);
                    if (!empty($key) && !empty($value)) {
                        putenv("$key=$value");
                    }
                }
            }
        }
    }

    private function loadFixedWords() {
        $fixedWordsFile = dirname(__DIR__) . '/fixed-words.json';
        if (file_exists($fixedWordsFile)) {
            $content = file_get_contents($fixedWordsFile);
            $data = json_decode($content, true);
            if ($data) {
                $this->fixedWords = $data;
            }
        }
    }

    private function loadFixedWordsLinks() {
        $linksFile = dirname(__DIR__) . '/fixed-words-links.json';
        if (file_exists($linksFile)) {
            $content = file_get_contents($linksFile);
            $data = json_decode($content, true);
            if ($data) {
                $this->fixedWordsLinks = $data;
            }
        }
    }

    private function loadAirlinesLinks() {
        $airlinesFile = dirname(__DIR__) . '/airlines-links.json';
        if (file_exists($airlinesFile)) {
            $content = file_get_contents($airlinesFile);
            $data = json_decode($content, true);
            if ($data) {
                $this->airlinesLinks = $data;
            }
        }
    }

    private function getFixedWordsForLanguage($languageCode) {
        $langCode = strtolower($languageCode);
        if (strpos($langCode, '-') !== false) {
            $langCode = explode('-', $langCode)[0];
        }
        if ($langCode === 'nb') {
            $langCode = 'no';
        }
        $words = [];
        foreach ($this->fixedWords as $term => $translations) {
            if (isset($translations[$langCode]) && is_array($translations[$langCode])) {
                foreach ($translations[$langCode] as $word) {
                    $words[$word] = ['term' => $term, 'type' => 'fixed'];
                }
            }
        }
        uksort($words, function($a, $b) {
            return strlen($b) - strlen($a);
        });
        return $words;
    }

    private function getAirlinesForLanguage($languageCode) {
        $langCode = strtolower($languageCode);
        if (strpos($langCode, '-') !== false) {
            $langCode = explode('-', $langCode)[0];
        }
        if ($langCode === 'nb') {
            $langCode = 'no';
        }
        if ($langCode === 'et') {
            $langCode = 'ee';
        }
        
        $airlines = [];
        if (isset($this->airlinesLinks[$langCode]) && is_array($this->airlinesLinks[$langCode])) {
            foreach ($this->airlinesLinks[$langCode] as $airline) {
                if (isset($airline['text']) && isset($airline['link'])) {
                    $airlines[$airline['text']] = [
                        'term' => $airline['text'],
                        'type' => 'airline',
                        'link' => $airline['link']
                    ];
                }
            }
        }
        uksort($airlines, function($a, $b) {
            return strlen($b) - strlen($a);
        });
        return $airlines;
    }

    private function getLinkForTerm($term, $languageCode) {
        $langCode = strtolower($languageCode);
        if (strpos($langCode, '-') !== false) {
            $langCode = explode('-', $langCode)[0];
        }
        if ($langCode === 'nb') {
            $langCode = 'no';
        }
        
        if (isset($this->fixedWordsLinks[$langCode][$term])) {
            return $this->fixedWordsLinks[$langCode][$term];
        }
        return null;
    }

    public function translate($sourcePath, $targetPath, $targetLanguage, $includeLinks = true, $boldFixedWords = true) {
        try {
            if (!copy($sourcePath, $targetPath)) {
                return false;
            }

            $zip = new ZipArchive();
            if ($zip->open($targetPath) !== true) {
                @unlink($targetPath);
                return false;
            }

            $documentXml = $zip->getFromName('word/document.xml');
            if ($documentXml === false) {
                $zip->close();
                @unlink($targetPath);
                return false;
            }

            $relsXml = $zip->getFromName('word/_rels/document.xml.rels');
            $relsDom = new DOMDocument();
            if ($relsXml) {
                $relsDom->loadXML($relsXml);
            } else {
                $relsDom->loadXML('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"></Relationships>');
            }
            $relsRoot = $relsDom->documentElement;
            $newRelationships = [];

            $dom = new DOMDocument();
            $dom->loadXML($documentXml);

            $xpath = new DOMXPath($dom);
            $xpath->registerNamespace('w', 'http://schemas.openxmlformats.org/wordprocessingml/2006/main');
            $xpath->registerNamespace('r', 'http://schemas.openxmlformats.org/officeDocument/2006/relationships');

            $paragraphs = $xpath->query('//w:p');
            if ($paragraphs->length === 0) {
                $zip->close();
                return true;
            }

            $paragraphsToTranslate = [];
            $paragraphMapping = [];

            foreach ($paragraphs as $paragraphIndex => $paragraph) {
                $textNodes = $xpath->query('.//w:t', $paragraph);
                if ($textNodes->length === 0) continue;

                $paragraphText = '';
                $nodeList = [];
                foreach ($textNodes as $node) {
                    $text = $node->nodeValue;
                    $paragraphText .= $text;
                    $nodeList[] = $node;
                }

                if (!empty(trim($paragraphText))) {
                    $paragraphsToTranslate[] = $paragraphText;
                    $paragraphMapping[] = [
                        'text' => $paragraphText,
                        'nodes' => $nodeList,
                        'paragraph' => $paragraph
                    ];
                }
            }

            if (empty($paragraphsToTranslate)) {
                $zip->close();
                return true;
            }

            $translatedParagraphs = $this->translateTexts($paragraphsToTranslate, $targetLanguage);
            if ($translatedParagraphs === false) {
                $zip->close();
                @unlink($targetPath);
                return false;
            }

            // Get fixed words and airlines for the target language
            $fixedWords = $this->getFixedWordsForLanguage($targetLanguage);
            $airlines = $this->getAirlinesForLanguage($targetLanguage);
            
            // Merge both into single lookup (airlines first, then fixed words - longer matches first)
            $allKeywords = array_merge($airlines, $fixedWords);
            uksort($allKeywords, function($a, $b) {
                return strlen($b) - strlen($a);
            });

            foreach ($paragraphMapping as $index => $mapping) {
                if (!isset($translatedParagraphs[$index])) continue;

                $translatedText = $translatedParagraphs[$index];
                $nodes = $mapping['nodes'];
                $paragraph = $mapping['paragraph'];

                $this->applyTranslationWithLinks($dom, $xpath, $paragraph, $nodes, $translatedText, $allKeywords, $targetLanguage, $newRelationships, $includeLinks, $boldFixedWords);
            }

            foreach ($newRelationships as $relId => $url) {
                $rel = $relsDom->createElement('Relationship');
                $rel->setAttribute('Id', $relId);
                $rel->setAttribute('Type', 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink');
                $rel->setAttribute('Target', $url);
                $rel->setAttribute('TargetMode', 'External');
                $relsRoot->appendChild($rel);
            }

            $modifiedXml = $dom->saveXML();
            $modifiedRelsXml = $relsDom->saveXML();

            if (!$zip->deleteName('word/document.xml')) {
                $zip->close();
                @unlink($targetPath);
                return false;
            }
            if (!$zip->addFromString('word/document.xml', $modifiedXml)) {
                $zip->close();
                @unlink($targetPath);
                return false;
            }

            if ($relsXml) {
                $zip->deleteName('word/_rels/document.xml.rels');
            }
            $zip->addFromString('word/_rels/document.xml.rels', $modifiedRelsXml);

            $zip->close();
            return true;

        } catch (Exception $e) {
            error_log('Translation error: ' . $e->getMessage());
            return false;
        }
    }

    private function applyTranslationWithLinks($dom, $xpath, $paragraph, $nodes, $translatedText, $allKeywords, $targetLanguage, &$newRelationships, $includeLinks = true, $boldFixedWords = true) {
        $segments = $this->splitTextByKeywords($translatedText, $allKeywords, $targetLanguage);

        // Check if any keywords were found
        $hasKeywords = false;
        foreach ($segments as $segment) {
            if ($segment['highlight']) {
                $hasKeywords = true;
                break;
            }
        }

        // If no keywords, just replace text in existing nodes (preserves formatting)
        if (!$hasKeywords) {
            if (count($nodes) > 0) {
                $nodes[0]->nodeValue = $translatedText;
                for ($i = 1; $i < count($nodes); $i++) {
                    $nodes[$i]->nodeValue = '';
                }
            }
            return;
        }

        // Remove existing runs and hyperlinks
        $runsToRemove = $xpath->query('.//w:r', $paragraph);
        foreach ($runsToRemove as $run) {
            $run->parentNode->removeChild($run);
        }
        $hyperlinksToRemove = $xpath->query('.//w:hyperlink', $paragraph);
        foreach ($hyperlinksToRemove as $hl) {
            $hl->parentNode->removeChild($hl);
        }

        $nsUri = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
        $rNsUri = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';

        foreach ($segments as $segment) {
            $run = $dom->createElementNS($nsUri, 'w:r');
            $runProps = $dom->createElementNS($nsUri, 'w:rPr');

            // Add formatting for highlighted words
            if ($segment['highlight']) {
                if ($segment['type'] === 'fixed' && $boldFixedWords) {
                    $bold = $dom->createElementNS($nsUri, 'w:b');
                    $runProps->appendChild($bold);
                }
                // Blue color and underline only when links are enabled
                if ($includeLinks) {
                    $color = $dom->createElementNS($nsUri, 'w:color');
                    $color->setAttribute('w:val', '0000FF');
                    $runProps->appendChild($color);

                    $underline = $dom->createElementNS($nsUri, 'w:u');
                    $underline->setAttribute('w:val', 'single');
                    $runProps->appendChild($underline);
                }
            }

            $run->appendChild($runProps);

            $text = $dom->createElementNS($nsUri, 'w:t');
            $text->nodeValue = $segment['text'];
            $text->setAttribute('xml:space', 'preserve');
            $run->appendChild($text);

            // Wrap in hyperlink if keyword has a link and links are enabled
            if ($includeLinks && $segment['highlight'] && isset($segment['link']) && $segment['link']) {
                $relId = 'rId' . $this->relationshipId++;
                $newRelationships[$relId] = $segment['link'];

                $hyperlink = $dom->createElementNS($nsUri, 'w:hyperlink');
                $hyperlink->setAttributeNS($rNsUri, 'r:id', $relId);
                $hyperlink->appendChild($run);
                $paragraph->appendChild($hyperlink);
            } else {
                $paragraph->appendChild($run);
            }
        }
    }

    private function splitTextByKeywords($text, $allKeywords, $targetLanguage) {
        if (empty($allKeywords) || empty($text)) {
            return [['text' => $text, 'highlight' => false, 'type' => null, 'link' => null]];
        }

        $wordList = array_keys($allKeywords);
        
        $patterns = [];
        foreach ($wordList as $word) {
            $patterns[] = preg_quote($word, '/');
        }
        $pattern = '/(' . implode('|', $patterns) . ')/iu';

        $parts = preg_split($pattern, $text, -1, PREG_SPLIT_DELIM_CAPTURE | PREG_SPLIT_NO_EMPTY);

        $segments = [];
        foreach ($parts as $part) {
            $isHighlight = false;
            $type = null;
            $link = null;
            
            foreach ($allKeywords as $word => $info) {
                if (mb_strtolower($part) === mb_strtolower($word)) {
                    $isHighlight = true;
                    $type = $info['type'];
                    
                    // Get link based on type
                    if ($type === 'airline' && isset($info['link'])) {
                        $link = $info['link'];
                    } elseif ($type === 'fixed' && isset($info['term'])) {
                        // Get the link for fixed words using the term and target language
                        $link = $this->getLinkForTerm($info['term'], $targetLanguage);
                    }
                    break;
                }
            }
            
            $segments[] = [
                'text' => $part,
                'highlight' => $isHighlight,
                'type' => $type,
                'link' => $link
            ];
        }

        return $segments;
    }

    private function translateTexts($texts, $targetLanguage) {
        if (empty($this->deeplApiKey)) {
            error_log('DeepL API key not configured');
            return false;
        }

        if (empty($texts)) {
            return [];
        }

        return $this->translateWithCurl($texts, $targetLanguage);
    }

    private function translateWithCurl($texts, $targetLanguage) {
        $targetLang = $this->convertLanguageCode($targetLanguage);

        $batchSize = 50;
        $batches = array_chunk($texts, $batchSize);
        $allTranslations = [];

        foreach ($batches as $batch) {
            $translations = $this->translateBatchCurl($batch, $targetLang);
            if ($translations === false) {
                return false;
            }
            $allTranslations = array_merge($allTranslations, $translations);
        }

        return $allTranslations;
    }

    private function translateBatchCurl($texts, $targetLang) {
        $url = $this->deeplApiUrl . '/v2/translate';

        $postFields = 'target_lang=' . urlencode($targetLang);
        foreach ($texts as $text) {
            $postFields .= '&text=' . urlencode($text);
        }

        $ch = curl_init();

        curl_setopt_array($ch, [
            CURLOPT_URL => $url,
            CURLOPT_POST => true,
            CURLOPT_POSTFIELDS => $postFields,
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_SSL_VERIFYPEER => true,
            CURLOPT_TIMEOUT => 120,
            CURLOPT_HTTPHEADER => [
                'Authorization: DeepL-Auth-Key ' . $this->deeplApiKey,
                'Content-Type: application/x-www-form-urlencoded'
            ]
        ]);

        $response = curl_exec($ch);
        $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $curlError = curl_error($ch);

        curl_close($ch);

        if ($response === false) {
            error_log('DeepL API cURL error: ' . $curlError);
            logApiFailure('DeepL API request failed', null, $curlError);
            return false;
        }

        $result = json_decode($response, true);

        if ($httpCode !== 200) {
            $errorMessage = isset($result['message']) ? $result['message'] : 'Unknown error';
            error_log('DeepL API error (HTTP ' . $httpCode . '): ' . $errorMessage);
            logApiFailure('DeepL API error: ' . $errorMessage, $httpCode);
            return false;
        }

        $translations = [];
        if (isset($result['translations']) && is_array($result['translations'])) {
            foreach ($result['translations'] as $translation) {
                $translations[] = $this->fixEuroSymbolPosition($translation['text']);
            }
        } else {
            error_log('DeepL API unexpected response format');
            logApiFailure('DeepL API unexpected response format', $httpCode);
            return false;
        }

        return $translations;
    }

    private function fixEuroSymbolPosition($text) {
        // Remove typographic double-quote characters introduced by translation
        $text = str_replace(["\u{201C}", "\u{201D}", "\u{201E}", "\u{201F}"], '', $text);
        // Euro word variants across languages (longest first to prevent partial matches)
        $euroVariants = '(?:'
            . '[Aa]vroya'   // Turkish dative
            . '|[Aa]vro'    // Turkish
            . '|eurót'      // Hungarian accusative
            . '|[Ee]urot'   // Estonian/Finnish plural
            . '|euroa'      // Finnish partitive
            . '|euron'      // Finnish/Estonian genitive
            . '|evrum'      // Bosnian/Croatian
            . '|evrov'      // Slovenian genitive
            . '|euró'       // Hungarian
            . '|eurų'       // Lithuanian
            . '|ευρώ'       // Greek
            . '|евро'       // Russian/Bulgarian
            . '|евра'       // Serbian/Macedonian (Cyrillic)
            . '|євро'       // Ukrainian
            . '|եվրο'       // Armenian
            . '|ევრო'       // Georgian
            . '|אירו'       // Hebrew
            . '|欧元'        // Chinese
            . '|[Ee]uro'    // English/Latin
            . '|EUR'        // Code
            . '|eiro'       // Latvian
            . '|euroon'     // Estonian illative
            . '|euroni'     // Albanian/Bosnian
            . '|evra'       // Serbian/Croatian (Latin)
            . '|يورو'       // Arabic
            . '|欧'         // Chinese (short form)
            . ')';
        $amountPattern = '(\{[a-zA-Z_]+\}|\d+(?:[.,\s]\d+)*)';

        // Only replace when paired with an amount: "amount <euro-variant>" → "€amount"
        $text = preg_replace('/' . $amountPattern . '\s*' . $euroVariants . '\b/u', '€$1', $text);

        // "amount €" → "€amount"
        $text = preg_replace('/' . $amountPattern . '\s*€/u', '€$1', $text);

        // CAD variants → "CAD amount"
        $cadVariants = '(?:Kanada\s+dollar(?:ini|[ıi])|Canadian\s+dollars?|דולר\s+קנדי|دولار\s+كندي|加元|CAD)';
        // "amount variant" → "CAD amount"
        $text = preg_replace('/' . $amountPattern . '\s*' . $cadVariants . '(?![a-zA-Z])/ui', 'CAD $1', $text);
        // "variant amount" → "CAD amount" (for CJK/Arabic where symbol precedes amount)
        $text = preg_replace('/' . $cadVariants . '\s*' . $amountPattern . '/ui', 'CAD $1', $text);

        return $text;
    }

    private function convertLanguageCode($languageCode) {
        $languageMap = [
            'EN-US'  => 'EN-US',
            'EN-GB'  => 'EN-GB',
            'EN'     => 'EN-US',
            'AR'     => 'AR',
            'BG'     => 'BG',
            'CS'     => 'CS',
            'DA'     => 'DA',
            'DE'     => 'DE',
            'EL'     => 'EL',
            'ES'     => 'ES',
            'ET'     => 'ET',
            'FI'     => 'FI',
            'FR'     => 'FR',
            'HU'     => 'HU',
            'ID'     => 'ID',
            'IT'     => 'IT',
            'JA'     => 'JA',
            'KO'     => 'KO',
            'LT'     => 'LT',
            'LV'     => 'LV',
            'NB'     => 'NB',
            'NL'     => 'NL',
            'PL'     => 'PL',
            'PT'     => 'PT-PT',
            'PT-PT'  => 'PT-PT',
            'PT-BR'  => 'PT-BR',
            'RO'     => 'RO',
            'RU'     => 'RU',
            'SL'     => 'SL',
            'SV'     => 'SV',
            'TR'     => 'TR',
            'UK'     => 'UK',
            'ZH'     => 'ZH',
            // Languages below may not be supported by DeepL; passed through as-is
            'HY'     => 'HY',
            'BS'     => 'BS',
            'CA'     => 'CA',
            'HR'     => 'HR',
            'HE'     => 'HE',
            'IS'     => 'IS',
            'KA'     => 'KA',
            'MK'     => 'MK',
            'SR'     => 'SR',
            'SQ'     => 'SQ',
        ];

        $upperCode = strtoupper($languageCode);
        return isset($languageMap[$upperCode]) ? $languageMap[$upperCode] : $upperCode;
    }

    public function mergeTranslatedDocuments($translatedPaths, $languages, $outputPath) {
        try {
            if (empty($translatedPaths)) return false;

            if (!copy($translatedPaths[0], $outputPath)) return false;

            $zip = new ZipArchive();
            if ($zip->open($outputPath) !== true) return false;

            $baseDocXml  = $zip->getFromName('word/document.xml');
            $baseRelsXml = $zip->getFromName('word/_rels/document.xml.rels');
            $zip->close();

            if ($baseDocXml === false) return false;

            $nsUri = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
            $rNsUri = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';

            $baseDom = new DOMDocument();
            $baseDom->loadXML($baseDocXml);
            $baseXpath = new DOMXPath($baseDom);
            $baseXpath->registerNamespace('w', $nsUri);

            $baseBody = $baseXpath->query('//w:body')->item(0);
            if (!$baseBody) return false;

            // sectPr must stay as the last child of w:body
            $sectPr = $baseXpath->query('w:sectPr', $baseBody)->item(0);

            // Prepend language heading for the first section
            $firstChild = $baseBody->firstChild;
            $headingNode = $this->createLanguageHeadingNode($baseDom, $languages[0]);
            $baseBody->insertBefore($headingNode, $firstChild);

            // Set up relationships DOM
            $relsDom = new DOMDocument();
            if ($baseRelsXml) {
                $relsDom->loadXML($baseRelsXml);
            } else {
                $relsDom->loadXML('<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"></Relationships>');
            }
            $relsRoot     = $relsDom->documentElement;
            $relIdCounter = 5000;

            // Append each additional language section
            for ($i = 1; $i < count($translatedPaths); $i++) {
                $otherZip = new ZipArchive();
                if ($otherZip->open($translatedPaths[$i]) !== true) continue;

                $otherDocXml  = $otherZip->getFromName('word/document.xml');
                $otherRelsXml = $otherZip->getFromName('word/_rels/document.xml.rels');
                $otherZip->close();

                if ($otherDocXml === false) continue;

                $otherDom = new DOMDocument();
                $otherDom->loadXML($otherDocXml);
                $otherXpath = new DOMXPath($otherDom);
                $otherXpath->registerNamespace('w', $nsUri);

                // Remap hyperlink relationship IDs to avoid collisions
                $relIdMapping = [];
                if ($otherRelsXml) {
                    $otherRelsDom = new DOMDocument();
                    $otherRelsDom->loadXML($otherRelsXml);
                    $otherRelsXpath = new DOMXPath($otherRelsDom);
                    $hyperlinks = $otherRelsXpath->query('//*[@Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink"]');
                    foreach ($hyperlinks as $rel) {
                        $oldId = $rel->getAttribute('Id');
                        $newId = 'rId' . $relIdCounter++;
                        $relIdMapping[$oldId] = $newId;

                        $newRel = $relsDom->createElement('Relationship');
                        $newRel->setAttribute('Id', $newId);
                        $newRel->setAttribute('Type', 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink');
                        $newRel->setAttribute('Target', $rel->getAttribute('Target'));
                        $newRel->setAttribute('TargetMode', 'External');
                        $relsRoot->appendChild($newRel);
                    }
                }

                // Page break paragraph
                $pageBreak = $this->createPageBreakNode($baseDom);
                if ($sectPr) {
                    $baseBody->insertBefore($pageBreak, $sectPr);
                } else {
                    $baseBody->appendChild($pageBreak);
                }

                // Language heading
                $heading = $this->createLanguageHeadingNode($baseDom, $languages[$i]);
                if ($sectPr) {
                    $baseBody->insertBefore($heading, $sectPr);
                } else {
                    $baseBody->appendChild($heading);
                }

                // Import body children (skip sectPr)
                $otherBody = $otherXpath->query('//w:body')->item(0);
                if (!$otherBody) continue;

                foreach ($otherBody->childNodes as $child) {
                    if ($child->nodeName === 'w:sectPr') continue;
                    $imported = $baseDom->importNode($child, true);
                    $this->remapHyperlinkIds($imported, $relIdMapping, $rNsUri);
                    if ($sectPr) {
                        $baseBody->insertBefore($imported, $sectPr);
                    } else {
                        $baseBody->appendChild($imported);
                    }
                }
            }

            // Write combined XML back into the output zip
            $zip2 = new ZipArchive();
            if ($zip2->open($outputPath) !== true) return false;

            $zip2->deleteName('word/document.xml');
            $zip2->addFromString('word/document.xml', $baseDom->saveXML());
            $zip2->deleteName('word/_rels/document.xml.rels');
            $zip2->addFromString('word/_rels/document.xml.rels', $relsDom->saveXML());
            $zip2->close();

            return true;

        } catch (Exception $e) {
            error_log('Merge error: ' . $e->getMessage());
            return false;
        }
    }

    private function createLanguageHeadingNode($dom, $languageCode) {
        $nsUri = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
        $langNames = [
            'AR' => 'Arabic',        'HY' => 'Armenian',     'BS' => 'Bosnian',
            'BG' => 'Bulgarian',     'CA' => 'Catalan',       'ZH' => 'Chinese (Simplified)',
            'HR' => 'Croatian',      'CS' => 'Czech',         'DA' => 'Danish',
            'NL' => 'Dutch',         'EN-US' => 'English (US)', 'EN-GB' => 'English (UK)',
            'ET' => 'Estonian',      'FI' => 'Finnish',       'FR' => 'French',
            'KA' => 'Georgian',      'DE' => 'German',        'EL' => 'Greek',
            'HE' => 'Hebrew',        'HU' => 'Hungarian',     'IS' => 'Icelandic',
            'IT' => 'Italian',       'LV' => 'Latvian',       'LT' => 'Lithuanian',
            'MK' => 'Macedonian',    'NB' => 'Norwegian',     'PL' => 'Polish',
            'PT-PT' => 'Portuguese (Portugal)', 'PT-BR' => 'Portuguese (Brazil)',
            'RO' => 'Romanian',      'RU' => 'Russian',       'SR' => 'Serbian',
            'SQ' => 'Albanian',      'SL' => 'Slovenian',     'ES' => 'Spanish',
            'SV' => 'Swedish',       'TR' => 'Turkish',       'UK' => 'Ukrainian',
        ];
        $langName = isset($langNames[$languageCode]) ? $langNames[$languageCode] : $languageCode;

        $para = $dom->createElementNS($nsUri, 'w:p');

        $pPr    = $dom->createElementNS($nsUri, 'w:pPr');
        $pStyle = $dom->createElementNS($nsUri, 'w:pStyle');
        $pStyle->setAttribute('w:val', 'Heading1');
        $pPr->appendChild($pStyle);
        $para->appendChild($pPr);

        $run  = $dom->createElementNS($nsUri, 'w:r');
        $rPr  = $dom->createElementNS($nsUri, 'w:rPr');
        $bold = $dom->createElementNS($nsUri, 'w:b');
        $color = $dom->createElementNS($nsUri, 'w:color');
        $color->setAttribute('w:val', '2E74B5');
        $sz = $dom->createElementNS($nsUri, 'w:sz');
        $sz->setAttribute('w:val', '40');
        $rPr->appendChild($bold);
        $rPr->appendChild($color);
        $rPr->appendChild($sz);
        $run->appendChild($rPr);

        $text = $dom->createElementNS($nsUri, 'w:t');
        $text->nodeValue = $langName;
        $text->setAttribute('xml:space', 'preserve');
        $run->appendChild($text);
        $para->appendChild($run);

        return $para;
    }

    private function createPageBreakNode($dom) {
        $nsUri = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';

        $para = $dom->createElementNS($nsUri, 'w:p');
        $run  = $dom->createElementNS($nsUri, 'w:r');
        $br   = $dom->createElementNS($nsUri, 'w:br');
        $br->setAttribute('w:type', 'page');
        $run->appendChild($br);
        $para->appendChild($run);

        return $para;
    }

    private function remapHyperlinkIds($node, $idMapping, $rNsUri) {
        if (empty($idMapping) || $node->nodeType !== XML_ELEMENT_NODE) return;

        if ($node->hasAttributeNS($rNsUri, 'id')) {
            $oldId = $node->getAttributeNS($rNsUri, 'id');
            if (isset($idMapping[$oldId])) {
                $node->setAttributeNS($rNsUri, 'r:id', $idMapping[$oldId]);
            }
        }

        foreach ($node->childNodes as $child) {
            $this->remapHyperlinkIds($child, $idMapping, $rNsUri);
        }
    }

    public function isConfigured() {
        return !empty($this->deeplApiKey);
    }

    public function getUsage() {
        if (empty($this->deeplApiKey)) {
            return false;
        }

        $url = $this->deeplApiUrl . '/v2/usage';

        $ch = curl_init();
        curl_setopt_array($ch, [
            CURLOPT_URL => $url,
            CURLOPT_POST => false,
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_SSL_VERIFYPEER => true,
            CURLOPT_TIMEOUT => 10,
            CURLOPT_HTTPHEADER => [
                'Authorization: DeepL-Auth-Key ' . $this->deeplApiKey
            ]
        ]);

        $response = curl_exec($ch);
        $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        curl_close($ch);

        if ($httpCode === 200) {
            return json_decode($response, true);
        }

        return false;
    }
}
