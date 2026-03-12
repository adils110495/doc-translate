<?php
header('Content-Type: application/json');
require_once __DIR__ . '/config.php';
require_once __DIR__ . '/logger.php';
require_once __DIR__ . '/translator.php';

// Sanitize input
function sanitizeInput($input) {
    return htmlspecialchars(strip_tags(trim($input)), ENT_QUOTES, 'UTF-8');
}

// Validate directory name to prevent traversal
function isValidDirectoryName($name) {
    // Allow alphanumeric, hyphens, underscores, spaces, square brackets, and parentheses
    // But prevent directory traversal characters
    if (strpos($name, '..') !== false || strpos($name, '/') !== false || strpos($name, '\\') !== false) {
        return false;
    }
    return preg_match('/^[a-zA-Z0-9_\-\s\[\]\(\)]+$/', $name);
}

try {
    // Validate request method
    if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
        throw new Exception('Invalid request method');
    }

    // Check if using existing file or uploading new one
    $useExisting = isset($_POST['use_existing']) && $_POST['use_existing'] === 'true';

    // Validate required fields
    if (!$useExisting && !isset($_FILES['docx_file'])) {
        throw new Exception('No file uploaded');
    }

    if ($useExisting && !isset($_POST['existing_file'])) {
        throw new Exception('No existing file specified');
    }

    if (!isset($_POST['target_language']) || !isset($_POST['project_name']) || !isset($_POST['topic_name'])) {
        throw new Exception('Missing required fields');
    }

    // Sanitize inputs
    $targetLanguage = sanitizeInput($_POST['target_language']);
    $projectName = sanitizeInput($_POST['project_name']);
    $topicName = sanitizeInput($_POST['topic_name']);
    $includeLinks = isset($_POST['include_links']) && $_POST['include_links'] === '1';

    // Validate directory names
    if (!isValidDirectoryName($projectName) || !isValidDirectoryName($topicName)) {
        throw new Exception('Invalid project or topic name. Avoid using special characters like / \\ .. or other path separators.');
    }

    // Validate language
    $validLanguages = ['EN-US', 'DA', 'NL', 'ET', 'FI', 'DE', 'IS', 'LV', 'NB', 'RO', 'RU', 'SV'];
    if (!in_array($targetLanguage, $validLanguages)) {
        throw new Exception('Invalid target language');
    }

    $fileName = '';
    $originalPath = '';

    if ($useExisting) {
        // Use existing source file
        $existingFile = sanitizeInput($_POST['existing_file']);
        $originalPath = SOURCE_DIR . '/' . $existingFile;

        if (!file_exists($originalPath)) {
            throw new Exception('Existing file not found');
        }

        $fileName = basename($originalPath);
    } else {
        // Handle new file upload
        $file = $_FILES['docx_file'];

        // Check for upload errors
        if ($file['error'] !== UPLOAD_ERR_OK) {
            throw new Exception('File upload error: ' . $file['error']);
        }

        // Validate file size (max 50MB)
        if ($file['size'] > MAX_FILE_SIZE) {
            throw new Exception('File size exceeds maximum limit of 50MB');
        }

        // Validate file extension
        $fileName = basename($file['name']);
        $fileExt = strtolower(pathinfo($fileName, PATHINFO_EXTENSION));

        if ($fileExt !== 'docx') {
            throw new Exception('Only DOCX files are allowed');
        }

        // Validate MIME type
        $finfo = finfo_open(FILEINFO_MIME_TYPE);
        $mimeType = finfo_file($finfo, $file['tmp_name']);
        finfo_close($finfo);

        $validMimeTypes = [
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            'application/zip' // DOCX files are zip archives
        ];

        if (!in_array($mimeType, $validMimeTypes)) {
            throw new Exception('Invalid file type. Only DOCX files are allowed.');
        }

        // Create directory structure for source files
        $sourceProjectDir = SOURCE_DIR . '/' . $projectName;
        $sourceTopicDir = $sourceProjectDir . '/' . $topicName;

        if (!is_dir($sourceTopicDir)) {
            if (!mkdir($sourceTopicDir, 0755, true)) {
                throw new Exception('Failed to create source directory structure');
            }
        }

        // Generate unique filename
        $fileNameWithoutExt = pathinfo($fileName, PATHINFO_FILENAME);
        $timestamp = time();
        $originalFileName = $fileNameWithoutExt . '_' . $timestamp . '.docx';

        // Save original file to source directory
        $originalPath = $sourceTopicDir . '/' . $originalFileName;
        if (!move_uploaded_file($file['tmp_name'], $originalPath)) {
            throw new Exception('Failed to save uploaded file');
        }
    }

    // Create directory structure for translated files
    $translatedProjectDir = TRANSLATED_DIR . '/' . $projectName;
    $translatedTopicDir = $translatedProjectDir . '/' . $topicName;

    if (!is_dir($translatedTopicDir)) {
        if (!mkdir($translatedTopicDir, 0755, true)) {
            throw new Exception('Failed to create translated directory structure');
        }
    }

    // Generate translated filename
    $fileNameWithoutExt = pathinfo($fileName, PATHINFO_FILENAME);
    $timestamp = time();
    $translatedFileName = $fileNameWithoutExt . '_' . $targetLanguage . '_' . $timestamp . '.docx';

    // Translate the document
    $translator = new DocumentTranslator();
    $translatedPath = $translatedTopicDir . '/' . $translatedFileName;

    $translationSuccess = $translator->translate(
        $originalPath,
        $translatedPath,
        $targetLanguage,
        $includeLinks
    );

    if (!$translationSuccess) {
        // Log failure
        logTranslation($fileName, $projectName, $topicName, $targetLanguage, 'FAILED', 'Translation process failed');

        // Clean up original file if it was newly uploaded
        if (!$useExisting) {
            @unlink($originalPath);
        }

        throw new Exception('Translation failed. Please try again.');
    }

    // Log success
    logTranslation($fileName, $projectName, $topicName, $targetLanguage, 'SUCCESS', '');

    echo json_encode([
        'success' => true,
        'message' => 'Translation completed successfully',
        'data' => [
            'original_file' => basename($originalPath),
            'translated_file' => $translatedFileName,
            'project' => $projectName,
            'topic' => $topicName,
            'language' => $targetLanguage
        ]
    ]);

} catch (Exception $e) {
    // Log error if we have enough info
    if (isset($fileName) && isset($projectName) && isset($topicName) && isset($targetLanguage)) {
        logTranslation($fileName, $projectName, $topicName, $targetLanguage, 'FAILED', $e->getMessage());
    }

    echo json_encode([
        'success' => false,
        'message' => $e->getMessage()
    ]);
}
