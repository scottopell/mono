//
//  KeyboardViewController.swift
//  SnippetKeyboard
//
//  Custom keyboard extension displaying saved snippets
//

import UIKit
import SwiftUI

class KeyboardViewController: UIInputViewController {

    private var snippets: [Snippet] = []
    private let storage = SnippetStorage()
    private var hostingController: UIHostingController<KeyboardView>?

    override func viewDidLoad() {
        super.viewDidLoad()

        loadSnippets()
        setupKeyboardView()
    }

    override func viewWillAppear(_ animated: Bool) {
        super.viewWillAppear(animated)
        loadSnippets()
    }

    private func loadSnippets() {
        snippets = storage.loadSnippets()
        updateView()
    }

    private func setupKeyboardView() {
        let keyboardView = KeyboardView(
            snippets: snippets,
            onSnippetTap: { [weak self] snippet in
                self?.insertSnippet(snippet)
            }
        )

        let hostingController = UIHostingController(rootView: keyboardView)
        hostingController.view.backgroundColor = .clear

        addChild(hostingController)
        view.addSubview(hostingController.view)
        hostingController.didMove(toParent: self)

        hostingController.view.translatesAutoresizingMaskIntoConstraints = false
        NSLayoutConstraint.activate([
            hostingController.view.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            hostingController.view.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            hostingController.view.topAnchor.constraint(equalTo: view.topAnchor),
            hostingController.view.bottomAnchor.constraint(equalTo: view.bottomAnchor)
        ])

        self.hostingController = hostingController
    }

    private func updateView() {
        guard let hostingController = hostingController else { return }

        let keyboardView = KeyboardView(
            snippets: snippets,
            onSnippetTap: { [weak self] snippet in
                self?.insertSnippet(snippet)
            }
        )

        hostingController.rootView = keyboardView
    }

    private func insertSnippet(_ snippet: Snippet) {
        guard let proxy = textDocumentProxy as UITextDocumentProxy? else { return }
        proxy.insertText(snippet.text)
    }

    override func textWillChange(_ textInput: UITextInput?) {
        // Called when text is about to change
    }

    override func textDidChange(_ textInput: UITextInput?) {
        // Called when text changes
    }
}
