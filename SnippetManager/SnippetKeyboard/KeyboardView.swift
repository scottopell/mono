//
//  KeyboardView.swift
//  SnippetKeyboard
//
//  SwiftUI view for the keyboard extension
//

import SwiftUI

struct KeyboardView: View {
    let snippets: [Snippet]
    let onSnippetTap: (Snippet) -> Void

    var body: some View {
        VStack(spacing: 0) {
            if snippets.isEmpty {
                EmptySnippetsView()
            } else {
                ScrollView(.horizontal, showsIndicators: true) {
                    HStack(spacing: 8) {
                        ForEach(snippets) { snippet in
                            SnippetButton(snippet: snippet) {
                                onSnippetTap(snippet)
                            }
                        }
                    }
                    .padding(.horizontal, 8)
                    .padding(.vertical, 8)
                }
                .frame(height: 100)
            }
        }
        .background(Color(UIColor.systemGray5))
    }
}

struct SnippetButton: View {
    let snippet: Snippet
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            VStack(alignment: .leading, spacing: 4) {
                Text(snippetPreview)
                    .font(.system(size: 14))
                    .lineLimit(2)
                    .foregroundColor(.primary)
                    .frame(maxWidth: 200, alignment: .leading)
                Text(formattedDate)
                    .font(.system(size: 10))
                    .foregroundColor(.secondary)
            }
            .padding(8)
            .frame(width: 200)
            .background(Color(UIColor.systemBackground))
            .cornerRadius(8)
        }
    }

    private var snippetPreview: String {
        let maxLength = 60
        if snippet.text.count > maxLength {
            let index = snippet.text.index(snippet.text.startIndex, offsetBy: maxLength)
            return String(snippet.text[..<index]) + "..."
        }
        return snippet.text
    }

    private var formattedDate: String {
        let formatter = RelativeDateTimeFormatter()
        formatter.unitsStyle = .abbreviated
        return formatter.localizedString(for: snippet.timestamp, relativeTo: Date())
    }
}

struct EmptySnippetsView: View {
    var body: some View {
        VStack {
            Text("No snippets saved")
                .font(.system(size: 14))
                .foregroundColor(.secondary)
                .padding()
        }
        .frame(height: 100)
        .frame(maxWidth: .infinity)
    }
}

#Preview {
    KeyboardView(
        snippets: [
            Snippet(text: "This is a sample snippet", timestamp: Date()),
            Snippet(text: "Another snippet example", timestamp: Date().addingTimeInterval(-3600))
        ],
        onSnippetTap: { _ in }
    )
}
