//
//  TextProcessing.swift
//  ClipKitCore
//
//  Utilities for text processing and preview generation
//

import Foundation

public enum TextProcessing {
    /// Create a preview of text with a maximum length
    public static func preview(of text: String, maxLength: Int = 100) -> String {
        guard text.count > maxLength else { return text }

        let endIndex = text.index(text.startIndex, offsetBy: maxLength)
        let preview = String(text[..<endIndex])
        return preview + "..."
    }

    /// Get the first line of text
    public static func firstLine(of text: String) -> String {
        text.components(separatedBy: .newlines).first ?? text
    }

    /// Count words in text
    public static func wordCount(of text: String) -> Int {
        let words = text.components(separatedBy: .whitespacesAndNewlines)
        return words.filter { !$0.isEmpty }.count
    }

    /// Count lines in text
    public static func lineCount(of text: String) -> Int {
        let lines = text.components(separatedBy: .newlines)
        return lines.count
    }

    /// Detect if text is likely code
    public static func isLikelyCode(_ text: String) -> Bool {
        let codeIndicators = ["{", "}", "(", ")", "function", "class", "var", "let", "const", "import", "def"]
        let indicatorCount = codeIndicators.reduce(0) { count, indicator in
            count + (text.contains(indicator) ? 1 : 0)
        }
        return indicatorCount >= 3
    }

    /// Detect if text is a URL
    public static func isURL(_ text: String) -> Bool {
        let detector = try? NSDataDetector(types: NSTextCheckingResult.CheckingType.link.rawValue)
        let matches = detector?.matches(in: text, range: NSRange(text.startIndex..., in: text))
        return matches?.first?.range.length == text.count
    }

    /// Format byte size as human-readable string
    public static func formatByteSize(_ bytes: Int64) -> String {
        let formatter = ByteCountFormatter()
        formatter.allowedUnits = [.useKB, .useMB, .useGB]
        formatter.countStyle = .file
        return formatter.string(fromByteCount: bytes)
    }
}
