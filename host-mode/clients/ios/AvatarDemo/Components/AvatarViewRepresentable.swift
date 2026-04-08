import SwiftUI
import AvatarKit

struct AvatarViewRepresentable: UIViewRepresentable {
    let avatar: Avatar
    let onCreated: (AvatarController) -> Void

    func makeUIView(context: Context) -> AvatarView {
        let avatarView = AvatarView(avatar: avatar)
        avatarView.isOpaque = false
        avatarView.contentTransform = .identity
        onCreated(avatarView.controller)
        return avatarView
    }

    func updateUIView(_ uiView: AvatarView, context: Context) {}
}
