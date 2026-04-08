import SwiftUI
import AvatarKit

struct ConfigCheckView: View {
    enum CheckState {
        case loading
        case healthError(missing: [String])
        case networkError(String)
        case ready(appId: String, environment: String)
    }

    @State private var checkState: CheckState = .loading
    @State private var sdkInitialized = false

    var body: some View {
        VStack(spacing: 20) {
            // Guide image
            Link(destination: URL(string: "https://dash.spatialreal.ai")!) {
                Image("api-key-guide")
                    .resizable()
                    .aspectRatio(contentMode: .fit)
                    .cornerRadius(10)
            }
            .padding(.horizontal, 16)

            switch checkState {
            case .loading:
                ProgressView("Checking server...")

            case .healthError(let missing):
                VStack(spacing: 12) {
                    Image(systemName: "exclamationmark.triangle.fill")
                        .font(.largeTitle)
                        .foregroundStyle(.orange)
                    Text("Server Missing Configuration")
                        .font(.headline)
                    Text("The following environment variables are not set on the server:")
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                        .multilineTextAlignment(.center)
                    ForEach(missing, id: \.self) { key in
                        Text(key)
                            .font(.system(.caption, design: .monospaced))
                            .padding(.horizontal, 12)
                            .padding(.vertical, 4)
                            .background(Color.red.opacity(0.1))
                            .cornerRadius(6)
                    }
                    Button("Retry") {
                        checkState = .loading
                        Task { await checkServer() }
                    }
                    .buttonStyle(.bordered)
                    .padding(.top, 8)
                }
                .padding()

            case .networkError(let message):
                VStack(spacing: 12) {
                    Image(systemName: "wifi.slash")
                        .font(.largeTitle)
                        .foregroundStyle(.red)
                    Text("Cannot Connect to Server")
                        .font(.headline)
                    Text(message)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                        .multilineTextAlignment(.center)
                    Text(Config.hostServerURL)
                        .font(.system(.caption2, design: .monospaced))
                        .foregroundStyle(.secondary)
                    Button("Retry") {
                        checkState = .loading
                        Task { await checkServer() }
                    }
                    .buttonStyle(.bordered)
                    .padding(.top, 8)
                }
                .padding()

            case .ready(let appId, let environment):
                VStack(spacing: 12) {
                    Image(systemName: "checkmark.circle.fill")
                        .font(.largeTitle)
                        .foregroundStyle(.green)
                    Text("Server Ready")
                        .font(.headline)
                    VStack(spacing: 4) {
                        Text("App ID: \(appId)")
                            .font(.system(.caption, design: .monospaced))
                        Text("Environment: \(environment)")
                            .font(.system(.caption, design: .monospaced))
                    }
                    .foregroundStyle(.secondary)

                    NavigationLink {
                        PlaygroundView()
                    } label: {
                        Text("Start")
                            .font(.headline)
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, 8)
                    }
                    .buttonStyle(.borderedProminent)
                    .padding(.horizontal, 40)
                    .padding(.top, 8)
                    .disabled(!sdkInitialized)
                }
                .padding()
            }
        }
        .navigationTitle("Config Check")
        .navigationBarTitleDisplayMode(.inline)
        .task {
            await checkServer()
        }
    }

    private func checkServer() async {
        // Step 1: Check healthz
        let healthURL = URL(string: "\(Config.hostServerURL)/healthz")!
        do {
            let (data, _) = try await URLSession.shared.data(from: healthURL)
            guard let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else {
                checkState = .networkError("Invalid response from /healthz")
                return
            }

            let ok = json["ok"] as? Bool ?? false
            if !ok {
                let missing = json["missing"] as? [String] ?? []
                checkState = .healthError(missing: missing)
                return
            }
        } catch {
            checkState = .networkError(error.localizedDescription)
            return
        }

        // Step 2: Fetch config
        let configURL = URL(string: "\(Config.hostServerURL)/api/config")!
        do {
            let (data, _) = try await URLSession.shared.data(from: configURL)
            guard let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
                  let appId = json["appId"] as? String else {
                checkState = .networkError("Invalid response from /api/config")
                return
            }

            let environment = json["environment"] as? String ?? "intl"

            // Initialize SDK
            let env: Environment = (environment == "cn") ? .cn : .intl
            AvatarSDK.initialize(
                appID: appId,
                configuration: Configuration(
                    environment: env,
                    audioFormat: AudioFormat(sampleRate: 16000),
                    drivingServiceMode: .host,
                    logLevel: .all
                )
            )
            sdkInitialized = true
            checkState = .ready(appId: appId, environment: environment)
        } catch {
            checkState = .networkError(error.localizedDescription)
        }
    }
}
