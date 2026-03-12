<?php
header('Content-Type: application/json');
require_once __DIR__ . '/config.php';

// Load hidden items config
$hiddenItems = ['projects' => [], 'topics' => []];
$hiddenFile = dirname(__DIR__) . '/hidden-items.json';
if (file_exists($hiddenFile)) {
    $hiddenData = json_decode(file_get_contents($hiddenFile), true);
    if ($hiddenData) {
        $hiddenItems = $hiddenData;
    }
}
$hiddenProjects = array_map('strtolower', $hiddenItems['projects'] ?? []);
$hiddenTopics = array_map('strtolower', $hiddenItems['topics'] ?? []);

try {
    if (!is_dir(TRANSLATED_DIR)) {
        echo json_encode([
            'success' => true,
            'files' => []
        ]);
        exit;
    }

    $files = [];

    // Scan projects
    $projects = array_diff(scandir(TRANSLATED_DIR), ['.', '..']);

    foreach ($projects as $project) {
        $projectPath = TRANSLATED_DIR . '/' . $project;

        if (!is_dir($projectPath)) {
            continue;
        }

        // Skip hidden projects
        if (in_array(strtolower($project), $hiddenProjects)) {
            continue;
        }

        $files[$project] = [];

        // Scan topics within project
        $topics = array_diff(scandir($projectPath), ['.', '..']);

        foreach ($topics as $topic) {
            $topicPath = $projectPath . '/' . $topic;

            if (!is_dir($topicPath)) {
                continue;
            }

            // Skip hidden topics
            if (in_array(strtolower($topic), $hiddenTopics)) {
                continue;
            }

            $files[$project][$topic] = [];

            // Scan files within topic
            $topicFiles = array_diff(scandir($topicPath), ['.', '..']);

            foreach ($topicFiles as $file) {
                $filePath = $topicPath . '/' . $file;

                if (!is_file($filePath)) {
                    continue;
                }

                // Extract language from filename (format: name_LANG_timestamp.docx)
                $language = 'Unknown';
                if (preg_match('/_([A-Z]{2}(?:-[A-Z]{2})?)_\d+\.docx$/', $file, $matches)) {
                    $language = $matches[1];
                }

                $relativePath = $project . '/' . $topic . '/' . $file;

                $files[$project][$topic][] = [
                    'name' => $file,
                    'path' => $relativePath,
                    'language' => $language,
                    'date' => date('Y-m-d H:i:s', filemtime($filePath)),
                    'size' => filesize($filePath)
                ];
            }

            // Sort files by date (newest first)
            usort($files[$project][$topic], function($a, $b) {
                return strtotime($b['date']) - strtotime($a['date']);
            });

            // Remove empty topics
            if (empty($files[$project][$topic])) {
                unset($files[$project][$topic]);
            }
        }

        // Remove empty projects
        if (empty($files[$project])) {
            unset($files[$project]);
        }
    }

    echo json_encode([
        'success' => true,
        'files' => $files
    ]);

} catch (Exception $e) {
    echo json_encode([
        'success' => false,
        'message' => 'Error loading files: ' . $e->getMessage()
    ]);
}
