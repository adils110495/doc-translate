<?php
header('Content-Type: application/json');
require_once __DIR__ . '/config.php';
require_once __DIR__ . '/logger.php';
require_once __DIR__ . '/translator.php';

function sanitizeInput($input) {
    return htmlspecialchars(strip_tags(trim($input)), ENT_QUOTES, 'UTF-8');
}

function isValidDirectoryName($name) {
    if (strpos($name, '..') !== false || strpos($name, '/') !== false || strpos($name, '\\') !== false) {
        return false;
    }
    return preg_match('/^[a-zA-Z0-9_\-\s\[\]\(\)]+$/', $name);
}

try {
    if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
        throw new Exception('Invalid request method');
    }

    $useExisting = isset($_POST['use_existing']) && $_POST['use_existing'] === 'true';

    if (!$useExisting && !isset($_FILES['docx_file'])) {
        throw new Exception('No file uploaded');
    }

    if ($useExisting && !isset($_POST['existing_file'])) {
        throw new Exception('No existing file specified');
    }

    if (!isset($_POST['target_languages']) || !is_array($_POST['target_languages']) || empty($_POST['target_languages'])) {
        throw new Exception('No target languages specified');
    }

    if (!isset($_POST['project_name']) || !isset($_POST['topic_name'])) {
        throw new Exception('Missing required fields');
    }

    $projectName = sanitizeInput($_POST['project_name']);
    $topicName   = sanitizeInput($_POST['topic_name']);
    $includeLinks   = isset($_POST['include_links'])   && $_POST['include_links']   === '1';
    $boldFixedWords = isset($_POST['bold_fixed_words']) && $_POST['bold_fixed_words'] === '1';

    if (!isValidDirectoryName($projectName) || !isValidDirectoryName($topicName)) {
        throw new Exception('Invalid project or topic name. Avoid using special characters like / \\ .. or other path separators.');
    }

    $validLanguages = [
        'AR', 'HY', 'BS', 'BG', 'CA', 'ZH', 'HR', 'CS', 'DA', 'NL',
        'ET', 'FI', 'FR', 'DE', 'EL', 'HE', 'HU', 'IS', 'IT', 'KA',
        'LV', 'LT', 'MK', 'NB', 'PL', 'PT-PT', 'PT-BR', 'RO', 'RU',
        'SR', 'SQ', 'SL', 'ES', 'SV', 'TR', 'UK', 'EN-US', 'EN-GB'
    ];

    $targetLanguages = [];
    foreach ($_POST['target_languages'] as $lang) {
        $lang = sanitizeInput($lang);
        if (!in_array($lang, $validLanguages)) {
            throw new Exception('Invalid target language: ' . $lang);
        }
        $targetLanguages[] = $lang;
    }

    if (empty($targetLanguages)) {
        throw new Exception('No valid target languages specified');
    }

    $fileName     = '';
    $originalPath = '';

    if ($useExisting) {
        $existingFile = sanitizeInput($_POST['existing_file']);
        $originalPath = SOURCE_DIR . '/' . $existingFile;
        if (!file_exists($originalPath)) {
            throw new Exception('Existing file not found');
        }
        $fileName = basename($originalPath);
    } else {
        $file = $_FILES['docx_file'];

        if ($file['error'] !== UPLOAD_ERR_OK) {
            throw new Exception('File upload error: ' . $file['error']);
        }
        if ($file['size'] > MAX_FILE_SIZE) {
            throw new Exception('File size exceeds maximum limit of 50MB');
        }

        $fileName = basename($file['name']);
        $fileExt  = strtolower(pathinfo($fileName, PATHINFO_EXTENSION));
        if ($fileExt !== 'docx') {
            throw new Exception('Only DOCX files are allowed');
        }

        $finfo    = finfo_open(FILEINFO_MIME_TYPE);
        $mimeType = finfo_file($finfo, $file['tmp_name']);
        finfo_close($finfo);

        $validMimeTypes = [
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            'application/zip',
        ];
        if (!in_array($mimeType, $validMimeTypes)) {
            throw new Exception('Invalid file type. Only DOCX files are allowed.');
        }

        $sourceTopicDir = SOURCE_DIR . '/' . $projectName . '/' . $topicName;
        if (!is_dir($sourceTopicDir)) {
            if (!mkdir($sourceTopicDir, 0755, true)) {
                throw new Exception('Failed to create source directory structure');
            }
        }

        $fileNameWithoutExt = pathinfo($fileName, PATHINFO_FILENAME);
        $timestamp          = time();
        $originalFileName   = $fileNameWithoutExt . '_' . $timestamp . '.docx';
        $originalPath       = $sourceTopicDir . '/' . $originalFileName;

        if (!move_uploaded_file($file['tmp_name'], $originalPath)) {
            throw new Exception('Failed to save uploaded file');
        }
    }

    // Ensure translated directory exists
    $translatedTopicDir = TRANSLATED_DIR . '/' . $projectName . '/' . $topicName;
    if (!is_dir($translatedTopicDir)) {
        if (!mkdir($translatedTopicDir, 0755, true)) {
            throw new Exception('Failed to create translated directory structure');
        }
    }

    $translator         = new DocumentTranslator();
    $fileNameWithoutExt = pathinfo($fileName, PATHINFO_FILENAME);
    $timestamp          = time();

    $tempFiles        = [];   // lang => temp path
    $successLanguages = [];
    $failedLanguages  = [];

    // Translate each language into a temporary file
    foreach ($targetLanguages as $lang) {
        $tempPath = $translatedTopicDir . '/tmp_' . $lang . '_' . $timestamp . '.docx';
        $ok       = $translator->translate($originalPath, $tempPath, $lang, $includeLinks, $boldFixedWords);
        if ($ok) {
            $tempFiles[$lang]   = $tempPath;
            $successLanguages[] = $lang;
        } else {
            $failedLanguages[] = $lang;
            logTranslation($fileName, $projectName, $topicName, $lang, 'FAILED', 'Translation process failed');
        }
    }

    if (empty($successLanguages)) {
        if (!$useExisting) {
            @unlink($originalPath);
        }
        throw new Exception('All translations failed. Please try again.');
    }

    // Build output filename
    $langLabel       = count($successLanguages) === 1 ? $successLanguages[0] : 'MULTI';
    $translatedFileName = $fileNameWithoutExt . '_' . $langLabel . '_' . $timestamp . '.docx';
    $translatedPath     = $translatedTopicDir . '/' . $translatedFileName;

    if (count($successLanguages) === 1) {
        // Only one language — just move the temp file
        rename($tempFiles[$successLanguages[0]], $translatedPath);
    } else {
        // Merge all temp files into a single combined document
        $mergeOk = $translator->mergeTranslatedDocuments(
            array_values($tempFiles),
            array_keys($tempFiles),
            $translatedPath
        );
        foreach ($tempFiles as $tp) {
            @unlink($tp);
        }
        if (!$mergeOk) {
            if (!$useExisting) {
                @unlink($originalPath);
            }
            throw new Exception('Failed to merge translated documents.');
        }
    }

    // Log each successful language
    foreach ($successLanguages as $lang) {
        logTranslation($fileName, $projectName, $topicName, $lang, 'SUCCESS', '');
    }

    echo json_encode([
        'success' => true,
        'message' => 'Translation completed successfully',
        'data'    => [
            'original_file'    => basename($originalPath),
            'translated_file'  => $translatedFileName,
            'project'          => $projectName,
            'topic'            => $topicName,
            'languages'        => $successLanguages,
            'failed_languages' => $failedLanguages,
        ],
    ]);

} catch (Exception $e) {
    if (isset($fileName) && isset($projectName) && isset($topicName)) {
        logTranslation($fileName, $projectName, $topicName, 'MULTI', 'FAILED', $e->getMessage());
    }
    echo json_encode([
        'success' => false,
        'message' => $e->getMessage(),
    ]);
}
