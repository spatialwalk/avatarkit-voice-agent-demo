import SwiftUI

struct ControlPanelView: View {
    @ObservedObject var viewModel: AvatarViewModel

    @State private var hostTextInput: String = ""

    var body: some View {
        VStack(spacing: 0) {
            // Status
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
                    .padding(.bottom, 4)
            }

            Divider()

            VStack(spacing: 0) {
                HStack(spacing: 8) {
                    if !viewModel.hostConnected {
                        Button(viewModel.hostConnecting ? "Connecting..." : "Connect") {
                            viewModel.hostConnect()
                        }
                        .buttonStyle(.bordered)
                        .disabled(viewModel.hostConnecting)
                    } else {
                        Button("Disconnect") {
                            viewModel.hostDisconnect()
                        }
                        .buttonStyle(.bordered)
                    }
                    Button("Interrupt") { viewModel.interrupt() }
                        .buttonStyle(.bordered)
                }
                .padding(.vertical, 8)

                Divider()

                VStack(alignment: .leading, spacing: 8) {
                    Button(viewModel.hostMicActive ? "Stop Mic" : "Start Mic") {
                        if viewModel.hostMicActive {
                            viewModel.hostStopMic()
                        } else {
                            viewModel.hostStartMic()
                        }
                    }
                    .buttonStyle(.borderedProminent)
                    .tint(viewModel.hostMicActive ? .red : .blue)
                    .padding(.horizontal, 16)

                    HStack(spacing: 8) {
                        TextField("Type a message...", text: $hostTextInput)
                            .textFieldStyle(.roundedBorder)
                            .font(.subheadline)
                            .onSubmit { sendHostText() }
                        Button("Send") { sendHostText() }
                            .buttonStyle(.bordered)
                            .disabled(hostTextInput.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                    }
                    .padding(.horizontal, 16)

                    Text("Connects to ws://192.168.1.185:8000/ws/agent")
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                        .padding(.horizontal, 16)
                        .padding(.vertical, 4)
                }
                .padding(.vertical, 8)
            }
        }
    }

    private func sendHostText() {
        let text = hostTextInput.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty else { return }
        viewModel.hostSendText(text)
        hostTextInput = ""
    }
}
