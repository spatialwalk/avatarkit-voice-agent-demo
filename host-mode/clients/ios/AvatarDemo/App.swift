import SwiftUI

@main
struct AvatarKitDemoApp: SwiftUI.App {
    var body: some Scene {
        WindowGroup {
            NavigationStack {
                ConfigCheckView()
            }
        }
    }
}
