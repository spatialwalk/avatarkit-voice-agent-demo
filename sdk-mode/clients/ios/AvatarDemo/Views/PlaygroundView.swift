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
                Label(viewModel.connectionState, systemImage: "antenna.radiowaves.left.and.right")
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
            controlButtons
                .padding(.vertical, 8)

            Divider()

            // 4. Two-column: Characters | Audio files
            HStack(alignment: .top, spacing: 0) {
                // Left: character list
                ScrollView {
                    characterSection
                        .padding(.top, 8)
                }
                .frame(maxWidth: .infinity)

                Divider()

                // Right: audio file list
                ScrollView {
                    audioFileSection
                        .padding(.top, 8)
                }
                .frame(maxWidth: .infinity)
            }
        }
        .navigationTitle("Playground")
        .navigationBarTitleDisplayMode(.inline)
        .onDisappear { viewModel.close() }
    }

    // MARK: - Control Buttons

    private var controlButtons: some View {
        HStack(spacing: 8) {
            let isConnected = viewModel.connectionState != "\(ConnectionState.disconnected)"
            Button("Start") { viewModel.start() }
                .buttonStyle(.bordered)
                .disabled(isConnected)
            Button("Interrupt") { viewModel.interrupt() }
                .buttonStyle(.bordered)
            Button("Close") { viewModel.close() }
                .buttonStyle(.bordered)
                .disabled(!isConnected)
        }
    }

    // MARK: - Audio File Section

    private var audioFileSection: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                Text("Audio Files")
                    .font(.caption)
                    .foregroundStyle(.secondary)
                Spacer()
                if viewModel.isSendingAudio {
                    ProgressView().scaleEffect(0.7)
                }
            }
            .padding(.horizontal, 12)

            ForEach(viewModel.audioFiles, id: \.self) { file in
                Button {
                    viewModel.sendAudioFile(file)
                } label: {
                    HStack(spacing: 6) {
                        Image(systemName: "waveform")
                            .font(.caption)
                        Text(file)
                            .font(.caption2)
                            .lineLimit(1)
                        Spacer()
                        if viewModel.currentlyPlayingFile == file {
                            Image(systemName: "speaker.wave.2.fill")
                                .font(.caption)
                                .foregroundStyle(.blue)
                        }
                    }
                    .padding(.vertical, 4)
                }
                .buttonStyle(.plain)
                .disabled(viewModel.isSendingAudio)
                .padding(.horizontal, 12)
            }
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
