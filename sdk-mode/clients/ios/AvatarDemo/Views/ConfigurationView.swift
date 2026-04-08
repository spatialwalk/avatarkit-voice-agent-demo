import SwiftUI
import AvatarKit

struct ConfigurationView: View {
    @AppStorage("appID") private var appID: String = ""
    @AppStorage("sessionToken") private var sessionToken: String = ""
    @AppStorage("selectedEnvironment") private var selectedEnvironment: String = "intl"

    @State private var isInitializing = false
    @State private var errorMessage: String?
    @State private var navigateToPlayground = false

    private var environment: AvatarKit.Environment {
        selectedEnvironment == "cn" ? .cn : .intl
    }

    private var canInit: Bool {
        let hasAppID = !appID.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
        let hasToken = !sessionToken.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
        return hasAppID && hasToken && !isInitializing
    }

    var body: some View {
        ScrollView {
            VStack(spacing: 24) {
                // Guide image
                Link(destination: URL(string: "https://dash.spatialreal.ai")!) {
                    Image("api-key-guide")
                        .resizable()
                        .aspectRatio(contentMode: .fit)
                        .cornerRadius(10)
                }
                .padding(.horizontal, 16)

                // App ID
                inputField(title: "App ID", placeholder: "Enter App ID", text: $appID,
                           link: ("Developer Platform", "https://dash.spatialreal.ai"))

                // Session Token
                inputField(title: "Session Token", placeholder: "Enter Session Token", text: $sessionToken)

                // Environment
                VStack(alignment: .leading, spacing: 8) {
                    Text("Environment")
                        .font(.headline)
                        .foregroundStyle(.secondary)
                        .padding(.horizontal, 16)
                    Picker("Environment", selection: $selectedEnvironment) {
                        Text("International").tag("intl")
                        Text("China").tag("cn")
                    }
                    .pickerStyle(.segmented)
                    .padding(.horizontal, 12)
                }

                // Error
                if let errorMessage {
                    Text(errorMessage)
                        .font(.caption)
                        .foregroundColor(.red)
                        .padding(.horizontal, 12)
                }

                // Initialize button
                Button(action: { initialize() }) {
                    HStack {
                        if isInitializing {
                            ProgressView().tint(.white)
                        }
                        Text(isInitializing ? "Initializing..." : "Initialize SDK")
                    }
                    .font(.headline)
                    .foregroundColor(.white)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 12)
                    .background(canInit ? Color.blue : Color.gray)
                    .cornerRadius(10)
                }
                .disabled(!canInit)
                .padding(.horizontal, 16)
            }
            .padding(.vertical, 16)
        }
        .navigationTitle("SDK Mode")
        .navigationBarTitleDisplayMode(.inline)
        .navigationDestination(isPresented: $navigateToPlayground) {
            PlaygroundView()
        }
    }

    private func initialize() {
        UIApplication.shared.sendAction(#selector(UIResponder.resignFirstResponder), to: nil, from: nil, for: nil)
        isInitializing = true
        errorMessage = nil

        AvatarSDK.initialize(
            appID: appID.trimmingCharacters(in: .whitespacesAndNewlines),
            configuration: Configuration(
                environment: environment,
                audioFormat: AudioFormat(sampleRate: 16000),
                drivingServiceMode: .sdk,
                logLevel: .all
            )
        )
        AvatarSDK.sessionToken = sessionToken.trimmingCharacters(in: .whitespacesAndNewlines)
        isInitializing = false
        navigateToPlayground = true
    }

    private func inputField(title: String, placeholder: String, text: Binding<String>,
                            link: (String, String)? = nil) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                Text(title)
                    .font(.headline)
                    .foregroundStyle(.secondary)
                Spacer()
                if let link {
                    Link(link.0, destination: URL(string: link.1)!)
                        .font(.caption)
                }
            }
            .padding(.horizontal, 16)

            TextField(placeholder, text: text)
                .font(.system(size: 14))
                .textFieldStyle(.roundedBorder)
                .autocapitalization(.none)
                .disableAutocorrection(true)
                .padding(.horizontal, 12)
        }
    }
}
