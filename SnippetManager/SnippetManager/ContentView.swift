//
//  ContentView.swift
//  SnippetManager
//
//  Main view displaying list of saved snippets
//

import SwiftUI

struct ContentView: View {
    @State private var snippets: [Snippet] = []
    private let storage = SnippetStorage()

    var body: some View {
        NavigationView {
            Group {
                if snippets.isEmpty {
                    VStack(spacing: 16) {
                        Image(systemName: "doc.text")
                            .font(.system(size: 60))
                            .foregroundColor(.gray)
                        Text("No Snippets Yet")
                            .font(.title2)
                            .foregroundColor(.gray)
                        Text("Use the share extension to save text from other apps")
                            .font(.subheadline)
                            .foregroundColor(.secondary)
                            .multilineTextAlignment(.center)
                            .padding(.horizontal)
                    }
                } else {
                    List {
                        ForEach(snippets) { snippet in
                            SnippetRow(snippet: snippet)
                        }
                        .onDelete(perform: deleteSnippets)
                    }
                }
            }
            .navigationTitle("Snippets")
            .onAppear {
                loadSnippets()
            }
        }
    }

    private func loadSnippets() {
        snippets = storage.loadSnippets()
    }

    private func deleteSnippets(at offsets: IndexSet) {
        for index in offsets {
            storage.deleteSnippet(snippets[index])
        }
        loadSnippets()
    }
}

struct SnippetRow: View {
    let snippet: Snippet

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(snippetPreview)
                .lineLimit(2)
            Text(formattedDate)
                .font(.caption)
                .foregroundColor(.secondary)
        }
        .padding(.vertical, 4)
    }

    private var snippetPreview: String {
        let maxLength = 50
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

#Preview {
    ContentView()
}
