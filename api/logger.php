<?php
require_once __DIR__ . '/config.php';

/**
 * Log translation activity
 *
 * @param string $fileName Original file name
 * @param string $projectName Project name
 * @param string $topicName Topic name
 * @param string $targetLanguage Target language code
 * @param string $status SUCCESS or FAILED
 * @param string $errorMessage Error message if status is FAILED
 */
function logTranslation($fileName, $projectName, $topicName, $targetLanguage, $status, $errorMessage = '') {
    $timestamp = date('Y-m-d H:i:s');

    $logEntry = sprintf(
        "[%s] %s | %s | %s | %s | %s",
        $timestamp,
        $status,
        $fileName,
        $projectName,
        $topicName,
        $targetLanguage
    );

    if ($status === 'FAILED' && !empty($errorMessage)) {
        $logEntry .= ' | Error: ' . $errorMessage;
    }

    $logEntry .= PHP_EOL;

    // Append to log file
    file_put_contents(LOG_FILE, $logEntry, FILE_APPEND | LOCK_EX);
}

function logApiFailure($message, $httpCode = null, $curlError = null) {
    $timestamp = date('Y-m-d H:i:s');

    $logEntry = sprintf("[%s] API_FAILURE | %s", $timestamp, $message);

    if ($httpCode !== null) {
        $logEntry .= ' | HTTP ' . $httpCode;
    }

    if (!empty($curlError)) {
        $logEntry .= ' | cURL: ' . $curlError;
    }

    $logEntry .= PHP_EOL;

    file_put_contents(LOG_FILE, $logEntry, FILE_APPEND | LOCK_EX);
}
