//
//  ShareViewController.swift
//  SnippetShare
//
//  Share extension to save text from other apps
//

import UIKit
import SwiftUI

class ShareViewController: UIViewController {

    private let storage = SnippetStorage()
    private var hostingController: UIHostingController<ShareView>?

    override func viewDidLoad() {
        super.viewDidLoad()

        extractSharedText { [weak self] text in
            guard let self = self, let text = text else {
                self?.showError()
                return
            }
            self.showShareView(with: text)
        }
    }

    private func extractSharedText(completion: @escaping (String?) -> Void) {
        guard let extensionItem = extensionContext?.inputItems.first as? NSExtensionItem,
              let itemProvider = extensionItem.attachments?.first else {
            completion(nil)
            return
        }

        if itemProvider.hasItemConformingToTypeIdentifier("public.plain-text") {
            itemProvider.loadItem(forTypeIdentifier: "public.plain-text", options: nil) { (item, error) in
                DispatchQueue.main.async {
                    if let text = item as? String {
                        completion(text)
                    } else if let data = item as? Data, let text = String(data: data, encoding: .utf8) {
                        completion(text)
                    } else {
                        completion(nil)
                    }
                }
            }
        } else if itemProvider.hasItemConformingToTypeIdentifier("public.text") {
            itemProvider.loadItem(forTypeIdentifier: "public.text", options: nil) { (item, error) in
                DispatchQueue.main.async {
                    if let text = item as? String {
                        completion(text)
                    } else if let data = item as? Data, let text = String(data: data, encoding: .utf8) {
                        completion(text)
                    } else {
                        completion(nil)
                    }
                }
            }
        } else {
            completion(nil)
        }
    }

    private func showShareView(with text: String) {
        let shareView = ShareView(
            text: text,
            onSave: { [weak self] in
                self?.saveSnippet(text)
            },
            onCancel: { [weak self] in
                self?.cancel()
            }
        )

        let hostingController = UIHostingController(rootView: shareView)
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

    private func saveSnippet(_ text: String) {
        let snippet = Snippet(text: text)
        storage.saveSnippet(snippet)

        // Show saved confirmation briefly before dismissing
        showSavedConfirmation()
    }

    private func showSavedConfirmation() {
        let savedView = SavedConfirmationView {
            self.dismiss()
        }

        let hostingController = UIHostingController(rootView: savedView)
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

        // Auto-dismiss after 1 second
        DispatchQueue.main.asyncAfter(deadline: .now() + 1.0) { [weak self] in
            self?.dismiss()
        }
    }

    private func showError() {
        let alert = UIAlertController(
            title: "Error",
            message: "Unable to extract text from the shared item.",
            preferredStyle: .alert
        )
        alert.addAction(UIAlertAction(title: "OK", style: .default) { [weak self] _ in
            self?.cancel()
        })
        present(alert, animated: true)
    }

    private func cancel() {
        extensionContext?.completeRequest(returningItems: nil, completionHandler: nil)
    }

    private func dismiss() {
        extensionContext?.completeRequest(returningItems: nil, completionHandler: nil)
    }
}
