import SwiftUI

@main
struct AvatarDemoApp: SwiftUI.App {
    var body: some Scene {
        WindowGroup {
            NavigationStack {
                ConfigurationView()
            }
        }
    }
}
