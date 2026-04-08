import SwiftUI
import AvatarKit

struct PlaygroundView: View {
    @StateObject private var viewModel = AvatarViewModel()
    @State private var selectedCharacterId: String? = nil
    @State private var avatarViewId: Int = 0
    @State private var customId: String = ""
    @State private var showCustomInput = false
    @State private var isLoadingAvatar = false
    @State private var loadError: String?
    @State private var loadProgress: Double = 0
    @State private var hostTextInput: String = ""
    @State private var isPaused = false

    var body: some View {
        VStack(spacing: 0) {
            // 1. Avatar view
            if let avatar = viewModel.avatar {
                AvatarViewRepresentable(avatar: avatar) { viewModel.setAvatarController($0) }
                    .id(avatarViewId)
                    .frame(maxWidth: .infinity)
                    .frame(height: 280)
                    .background(Color.black)
            } else {
                ZStack {
                    Color.black
                    if isLoadingAvatar {
                        VStack(spacing: 8) {
                            ProgressView().tint(.white)
                            Text("\(Int(loadProgress * 100))%")
                                .foregroundStyle(.white)
                                .font(.caption)
                                .fontWeight(.semibold)
                        }
                    } else {
                        Text("Select a character below")
                            .foregroundStyle(.gray)
                    }
                }
                .frame(maxWidth: .infinity)
                .frame(height: 280)
            }

            // 2. Status bar
            HStack(spacing: 16) {
                Label(viewModel.hostConnected ? "connected" : viewModel.hostConnecting ? "connecting..." : "disconnected",
                      systemImage: "server.rack")
                Label(viewModel.conversationState, systemImage: "bubble.left.and.bubble.right")
            }
            .font(.caption)
            .foregroundStyle(.secondary)
            .padding(.vertical, 6)

            if let errorMessage = viewModel.errorMessage {
                Text(errorMessage)
                    .font(.caption)
                    .foregroundColor(.red)
                    .padding(.horizontal, 12)
            }

            // 3. Control buttons
            HStack(spacing: 8) {
                Button(isPaused ? "Resume" : "Pause") {
                    if isPaused { viewModel.resume() } else { viewModel.pause() }
                    isPaused.toggle()
                }
                    .buttonStyle(.bordered)
                Button("Interrupt") { viewModel.interrupt() }
                    .buttonStyle(.bordered)
            }
            .padding(.vertical, 8)

            Divider()

            // 4. Two-column: Characters | Host controls
            HStack(alignment: .top, spacing: 0) {
                // Left: character list
                ScrollView {
                    characterSection
                        .padding(.top, 8)
                }
                .frame(maxWidth: .infinity)

                Divider()

                // Right: host controls
                ScrollView {
                    hostPanel
                        .padding(.top, 8)
                }
                .frame(maxWidth: .infinity)
            }
        }
        .navigationTitle("Playground")
        .navigationBarTitleDisplayMode(.inline)
        .onDisappear { viewModel.close() }
    }

    // MARK: - Host Panel

    private var hostPanel: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("Host Controls")
                .font(.caption)
                .foregroundStyle(.secondary)
                .padding(.horizontal, 12)

            // Connect / Disconnect
            if !viewModel.hostConnected {
                Button {
                    viewModel.hostConnect()
                } label: {
                    HStack {
                        Image(systemName: "bolt.fill")
                        Text(viewModel.hostConnecting ? "Connecting..." : "Connect")
                    }
                    .font(.caption)
                    .frame(maxWidth: .infinity)
                }
                .buttonStyle(.bordered)
                .disabled(viewModel.hostConnecting)
                .padding(.horizontal, 12)
            } else {
                Button {
                    viewModel.hostDisconnect()
                } label: {
                    HStack {
                        Image(systemName: "bolt.slash.fill")
                        Text("Disconnect")
                    }
                    .font(.caption)
                    .frame(maxWidth: .infinity)
                }
                .buttonStyle(.bordered)
                .tint(.red)
                .padding(.horizontal, 12)
            }

            // Mic toggle
            Button {
                if viewModel.hostMicActive {
                    viewModel.hostStopMic()
                } else {
                    viewModel.hostStartMic()
                }
            } label: {
                HStack {
                    Image(systemName: viewModel.hostMicActive ? "mic.slash.fill" : "mic.fill")
                    Text(viewModel.hostMicActive ? "Stop Mic" : "Start Mic")
                }
                .font(.caption)
                .frame(maxWidth: .infinity)
            }
            .buttonStyle(.bordered)
            .tint(viewModel.hostMicActive ? .red : .blue)
            .disabled(!viewModel.hostConnected)
            .padding(.horizontal, 12)

            // Text input
            HStack(spacing: 4) {
                TextField("Type a message...", text: $hostTextInput)
                    .font(.system(size: 12))
                    .textFieldStyle(.roundedBorder)
                    .onSubmit {
                        sendHostText()
                    }
                Button {
                    sendHostText()
                } label: {
                    Image(systemName: "paperplane.fill")
                        .font(.caption)
                }
                .buttonStyle(.bordered)
                .disabled(hostTextInput.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || !viewModel.hostConnected)
            }
            .padding(.horizontal, 12)

            Text("Connects to ws://localhost:8000/ws/agent.\nUsing hostmode-demo backend.")
                .font(.caption2)
                .foregroundStyle(.secondary)
                .padding(.horizontal, 12)
                .padding(.top, 8)
        }
    }

    // MARK: - Character Section

    private var characterSection: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack {
                Text("Characters")
                    .font(.caption)
                    .foregroundStyle(.secondary)
                Spacer()
                Link("IDs", destination: URL(string: "https://dash.spatialreal.ai")!)
                    .font(.caption2)
            }
            .padding(.horizontal, 12)

            ForEach(defaultCharacters) { character in
                Button {
                    loadCharacter(id: character.id)
                } label: {
                    HStack(spacing: 8) {
                        Circle()
                            .fill(Color.blue)
                            .frame(width: 26, height: 26)
                            .overlay(Text(String(character.name.prefix(1))).foregroundStyle(.white).font(.caption.bold()))
                        Text(character.name)
                            .font(.caption)
                        Spacer()
                        if selectedCharacterId == character.id && isLoadingAvatar {
                            Text("\(Int(loadProgress * 100))%")
                                .font(.caption2)
                                .foregroundStyle(.blue)
                                .fontWeight(.semibold)
                        } else if selectedCharacterId == character.id && viewModel.avatar != nil {
                            Image(systemName: "checkmark.circle.fill").foregroundStyle(.green).font(.caption)
                        }
                    }
                    .padding(.vertical, 3)
                }
                .buttonStyle(.plain)
                .disabled(isLoadingAvatar)
                .padding(.horizontal, 12)
            }

            // Custom ID
            if showCustomInput {
                VStack(spacing: 4) {
                    TextField("Character ID", text: $customId)
                        .font(.system(size: 12))
                        .textFieldStyle(.roundedBorder)
                        .autocapitalization(.none)
                    HStack(spacing: 4) {
                        Button("Load") {
                            let id = customId.trimmingCharacters(in: .whitespacesAndNewlines)
                            guard !id.isEmpty else { return }
                            loadCharacter(id: id)
                        }
                        .font(.caption)
                        .buttonStyle(.bordered)
                        .disabled(customId.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || isLoadingAvatar)
                        Button("Cancel") {
                            showCustomInput = false
                            customId = ""
                        }
                        .font(.caption)
                        .buttonStyle(.bordered)
                    }
                }
                .padding(.horizontal, 12)
            } else {
                Button {
                    showCustomInput = true
                } label: {
                    HStack(spacing: 8) {
                        Circle()
                            .strokeBorder(style: StrokeStyle(lineWidth: 1, dash: [3]))
                            .foregroundStyle(.secondary)
                            .frame(width: 26, height: 26)
                            .overlay(Text("+").foregroundStyle(.secondary).font(.caption))
                        Text("Custom ID")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                        Spacer()
                    }
                    .padding(.vertical, 3)
                }
                .buttonStyle(.plain)
                .padding(.horizontal, 12)
            }

            if let loadError {
                Text(loadError)
                    .font(.caption2)
                    .foregroundColor(.red)
                    .padding(.horizontal, 12)
            }
        }
    }

    private func sendHostText() {
        let text = hostTextInput.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty else { return }
        viewModel.hostSendText(text)
        hostTextInput = ""
    }

    private func loadCharacter(id: String) {
        selectedCharacterId = id
        isLoadingAvatar = true
        loadError = nil
        loadProgress = 0
        viewModel.close()
        viewModel.avatar = nil

        Task {
            do {
                let avatar = try await AvatarManager.shared.load(id: id, onProgress: { progress in
                    self.loadProgress = progress.fractionCompleted
                })
                viewModel.avatar = avatar
                avatarViewId += 1
                isLoadingAvatar = false
            } catch {
                loadError = error.localizedDescription
                isLoadingAvatar = false
            }
        }
    }
}
