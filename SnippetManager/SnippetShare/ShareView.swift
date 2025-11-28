//
//  ShareView.swift
//  SnippetShare
//
//  SwiftUI views for the share extension
//

import SwiftUI

struct ShareView: View {
    let text: String
    let onSave: (Bool) -> Void  // Takes isTimed parameter
    let onCancel: () -> Void

    @State private var snippetType: SnippetType = .timed

    enum SnippetType: String, CaseIterable {
        case regular = "Regular"
        case timed = "Timed"
    }

    var body: some View {
        NavigationView {
            VStack(spacing: 16) {
                Text("Save Snippet")
                    .font(.headline)
                    .padding(.top)

                // REQ-SM-008: Snippet type selection
                VStack(alignment: .leading, spacing: 8) {
                    Picker("Type", selection: $snippetType) {
                        ForEach(SnippetType.allCases, id: \.self) { type in
                            Text(type.rawValue).tag(type)
                        }
                    }
                    .pickerStyle(.segmented)
                    .padding(.horizontal)

                    if snippetType == .timed {
                        Text("Expires in 7 days")
                            .font(.caption)
                            .foregroundColor(.secondary)
                            .padding(.horizontal)
                    }
                }

                ScrollView {
                    Text(text)
                        .padding()
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .background(Color(UIColor.systemGray6))
                        .cornerRadius(8)
                        .padding(.horizontal)
                }

                HStack(spacing: 12) {
                    Button("Cancel") {
                        onCancel()
                    }
                    .buttonStyle(.bordered)
                    .frame(maxWidth: .infinity)

                    Button("Save") {
                        onSave(snippetType == .timed)
                    }
                    .buttonStyle(.borderedProminent)
                    .frame(maxWidth: .infinity)
                }
                .padding()
            }
            .navigationBarHidden(true)
        }
    }
}

struct SavedConfirmationView: View {
    let onDismiss: () -> Void

    var body: some View {
        VStack(spacing: 16) {
            Image(systemName: "checkmark.circle.fill")
                .font(.system(size: 60))
                .foregroundColor(.green)

            Text("Saved!")
                .font(.title2)
                .fontWeight(.semibold)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Color(UIColor.systemBackground))
    }
}

#Preview {
    ShareView(
        text: "This is some sample text that was shared from another app",
        onSave: { _ in },
        onCancel: {}
    )
}
