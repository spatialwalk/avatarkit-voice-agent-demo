import 'package:flutter/material.dart';
import 'package:avatar_kit/avatar_kit.dart' hide ConnectionState, Transform;

import 'avatar_view_model.dart';
import 'characters.dart';
import 'config.dart';

class PlaygroundPage extends StatefulWidget {
  const PlaygroundPage({super.key});

  @override
  State<PlaygroundPage> createState() => _PlaygroundPageState();
}

class _PlaygroundPageState extends State<PlaygroundPage> {
  final AvatarViewModel _vm = AvatarViewModel();
  final TextEditingController _textController = TextEditingController();
  final TextEditingController _customIdController = TextEditingController();

  String? _selectedCharacterId;
  bool _isPaused = false;
  bool _isLoadingAvatar = false;
  double _loadProgress = 0;
  String? _loadError;
  bool _showCustomInput = false;
  int _avatarViewKey = 0;

  @override
  void initState() {
    super.initState();
    _vm.addListener(_onVmChanged);
  }

  void _onVmChanged() {
    if (mounted) setState(() {});
  }

  @override
  void dispose() {
    _vm.removeListener(_onVmChanged);
    _vm.close();
    _vm.dispose();
    _textController.dispose();
    _customIdController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Playground'),
        centerTitle: true,
      ),
      body: Column(
        children: [
          // 1. Avatar view
          _buildAvatarSection(),
          // 2. Status bar
          _buildStatusBar(),
          // 3. Control buttons
          _buildControlButtons(),
          const Divider(height: 1),
          // 4. Two-column: Characters | Host controls
          Expanded(
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Expanded(child: SingleChildScrollView(child: _buildCharacterSection())),
                const VerticalDivider(width: 1),
                Expanded(child: SingleChildScrollView(child: _buildHostPanel())),
              ],
            ),
          ),
        ],
      ),
    );
  }

  // --- Avatar section ---

  Widget _buildAvatarSection() {
    if (_vm.avatar != null) {
      return Container(
        height: 280,
        width: double.infinity,
        color: Colors.black,
        child: AvatarWidget(
          key: ValueKey(_avatarViewKey),
          avatar: _vm.avatar!,
          onPlatformViewCreated: (controller) {
            _vm.setAvatarController(controller);
          },
        ),
      );
    }

    return Container(
      height: 280,
      width: double.infinity,
      color: Colors.black,
      child: Center(
        child: _isLoadingAvatar
            ? Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  const CircularProgressIndicator(color: Colors.white),
                  const SizedBox(height: 8),
                  Text(
                    '${(_loadProgress * 100).toInt()}%',
                    style: const TextStyle(
                      color: Colors.white,
                      fontSize: 12,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                ],
              )
            : const Text(
                'Select a character below',
                style: TextStyle(color: Colors.grey),
              ),
      ),
    );
  }

  // --- Status bar ---

  Widget _buildStatusBar() {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 6, horizontal: 12),
      child: Column(
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              const Icon(Icons.dns, size: 14, color: Colors.grey),
              const SizedBox(width: 4),
              Text(
                _vm.hostConnected
                    ? 'connected'
                    : _vm.hostConnecting
                        ? 'connecting...'
                        : 'disconnected',
                style: const TextStyle(fontSize: 12, color: Colors.grey),
              ),
              const SizedBox(width: 16),
              const Icon(Icons.chat_bubble_outline, size: 14, color: Colors.grey),
              const SizedBox(width: 4),
              Text(
                _vm.conversationState,
                style: const TextStyle(fontSize: 12, color: Colors.grey),
              ),
            ],
          ),
          if (_vm.errorMessage != null) ...[
            const SizedBox(height: 4),
            Text(
              _vm.errorMessage!,
              style: const TextStyle(fontSize: 12, color: Colors.red),
            ),
          ],
        ],
      ),
    );
  }

  // --- Control buttons ---

  Widget _buildControlButtons() {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 8),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          OutlinedButton(
            onPressed: () {
              if (_isPaused) {
                _vm.resume();
              } else {
                _vm.pause();
              }
              setState(() => _isPaused = !_isPaused);
            },
            child: Text(
              _isPaused ? 'Resume' : 'Pause',
              style: const TextStyle(fontSize: 12),
            ),
          ),
          const SizedBox(width: 8),
          OutlinedButton(
            onPressed: _vm.interrupt,
            child: const Text('Interrupt', style: TextStyle(fontSize: 12)),
          ),
        ],
      ),
    );
  }

  // --- Character section ---

  Widget _buildCharacterSection() {
    return Padding(
      padding: const EdgeInsets.only(top: 8),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 12),
            child: Row(
              children: [
                const Text(
                  'Characters',
                  style: TextStyle(fontSize: 12, color: Colors.grey),
                ),
                const Spacer(),
                GestureDetector(
                  onTap: () {},
                  child: const Text(
                    'IDs',
                    style: TextStyle(fontSize: 10, color: Colors.blue),
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 4),
          ...defaultCharacters.map((c) => _buildCharacterTile(c)),
          if (_showCustomInput) _buildCustomIdInput() else _buildCustomIdButton(),
          if (_loadError != null)
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 4),
              child: Text(
                _loadError!,
                style: const TextStyle(fontSize: 10, color: Colors.red),
              ),
            ),
        ],
      ),
    );
  }

  Widget _buildCharacterTile(AvatarCharacter character) {
    final isSelected = _selectedCharacterId == character.id;
    final isLoaded = isSelected && _vm.avatar != null;
    final isLoading = isSelected && _isLoadingAvatar;

    return InkWell(
      onTap: _isLoadingAvatar ? null : () => _loadCharacter(character.id),
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 4),
        child: Row(
          children: [
            CircleAvatar(
              radius: 13,
              backgroundColor: Colors.blue,
              child: Text(
                character.name[0],
                style: const TextStyle(color: Colors.white, fontSize: 12, fontWeight: FontWeight.bold),
              ),
            ),
            const SizedBox(width: 8),
            Text(character.name, style: const TextStyle(fontSize: 12)),
            const Spacer(),
            if (isLoading)
              Text(
                '${(_loadProgress * 100).toInt()}%',
                style: const TextStyle(fontSize: 10, color: Colors.blue, fontWeight: FontWeight.w600),
              ),
            if (isLoaded)
              const Icon(Icons.check_circle, color: Colors.green, size: 16),
          ],
        ),
      ),
    );
  }

  Widget _buildCustomIdButton() {
    return InkWell(
      onTap: () => setState(() => _showCustomInput = true),
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 4),
        child: Row(
          children: [
            Container(
              width: 26,
              height: 26,
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                border: Border.all(color: Colors.grey, style: BorderStyle.solid),
              ),
              child: const Center(
                child: Text('+', style: TextStyle(color: Colors.grey, fontSize: 12)),
              ),
            ),
            const SizedBox(width: 8),
            const Text('Custom ID', style: TextStyle(fontSize: 12, color: Colors.grey)),
          ],
        ),
      ),
    );
  }

  Widget _buildCustomIdInput() {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 4),
      child: Column(
        children: [
          TextField(
            controller: _customIdController,
            style: const TextStyle(fontSize: 12),
            decoration: const InputDecoration(
              hintText: 'Character ID',
              isDense: true,
              contentPadding: EdgeInsets.symmetric(horizontal: 8, vertical: 8),
              border: OutlineInputBorder(),
            ),
          ),
          const SizedBox(height: 4),
          Row(
            children: [
              OutlinedButton(
                onPressed: _isLoadingAvatar
                    ? null
                    : () {
                        final id = _customIdController.text.trim();
                        if (id.isNotEmpty) _loadCharacter(id);
                      },
                child: const Text('Load', style: TextStyle(fontSize: 12)),
              ),
              const SizedBox(width: 4),
              OutlinedButton(
                onPressed: () {
                  setState(() {
                    _showCustomInput = false;
                    _customIdController.clear();
                  });
                },
                child: const Text('Cancel', style: TextStyle(fontSize: 12)),
              ),
            ],
          ),
        ],
      ),
    );
  }

  // --- Host panel ---

  Widget _buildHostPanel() {
    return Padding(
      padding: const EdgeInsets.only(top: 8),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Padding(
            padding: EdgeInsets.symmetric(horizontal: 12),
            child: Text(
              'Host Controls',
              style: TextStyle(fontSize: 12, color: Colors.grey),
            ),
          ),
          const SizedBox(height: 8),

          // Connect / Disconnect
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 12),
            child: SizedBox(
              width: double.infinity,
              child: _vm.hostConnected
                  ? OutlinedButton.icon(
                      onPressed: _vm.hostDisconnect,
                      icon: const Icon(Icons.power_off, size: 14),
                      label: const Text('Disconnect', style: TextStyle(fontSize: 12)),
                      style: OutlinedButton.styleFrom(foregroundColor: Colors.red),
                    )
                  : OutlinedButton.icon(
                      onPressed: _vm.hostConnecting ? null : _vm.hostConnect,
                      icon: const Icon(Icons.bolt, size: 14),
                      label: Text(
                        _vm.hostConnecting ? 'Connecting...' : 'Connect',
                        style: const TextStyle(fontSize: 12),
                      ),
                    ),
            ),
          ),
          const SizedBox(height: 8),

          // Mic toggle
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 12),
            child: SizedBox(
              width: double.infinity,
              child: OutlinedButton.icon(
                onPressed: _vm.hostConnected
                    ? () {
                        if (_vm.hostMicActive) {
                          _vm.hostStopMic();
                        } else {
                          _vm.hostStartMic();
                        }
                      }
                    : null,
                icon: Icon(
                  _vm.hostMicActive ? Icons.mic_off : Icons.mic,
                  size: 14,
                ),
                label: Text(
                  _vm.hostMicActive ? 'Stop Mic' : 'Start Mic',
                  style: const TextStyle(fontSize: 12),
                ),
                style: OutlinedButton.styleFrom(
                  foregroundColor: _vm.hostMicActive ? Colors.red : Colors.blue,
                ),
              ),
            ),
          ),
          const SizedBox(height: 8),

          // Text input
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 12),
            child: Row(
              children: [
                Expanded(
                  child: TextField(
                    controller: _textController,
                    style: const TextStyle(fontSize: 12),
                    decoration: const InputDecoration(
                      hintText: 'Type a message...',
                      isDense: true,
                      contentPadding: EdgeInsets.symmetric(horizontal: 8, vertical: 8),
                      border: OutlineInputBorder(),
                    ),
                    onSubmitted: (_) => _sendHostText(),
                  ),
                ),
                const SizedBox(width: 4),
                IconButton(
                  onPressed: _vm.hostConnected && _textController.text.trim().isNotEmpty
                      ? _sendHostText
                      : null,
                  icon: const Icon(Icons.send, size: 16),
                  padding: EdgeInsets.zero,
                  constraints: const BoxConstraints(minWidth: 36, minHeight: 36),
                ),
              ],
            ),
          ),
          const SizedBox(height: 12),

          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 12),
            child: Text(
              'Connects to ${Config.hostServerURL}/ws/agent\nUsing hostmode-demo backend.',
              style: const TextStyle(fontSize: 10, color: Colors.grey),
            ),
          ),
        ],
      ),
    );
  }

  // --- Actions ---

  void _sendHostText() {
    final text = _textController.text.trim();
    if (text.isEmpty) return;
    _vm.hostSendText(text);
    _textController.clear();
  }

  Future<void> _loadCharacter(String id) async {
    setState(() {
      _selectedCharacterId = id;
      _isLoadingAvatar = true;
      _loadError = null;
      _loadProgress = 0;
    });

    _vm.close();
    _vm.avatar = null;

    try {
      final avatar = await AvatarManager.shared.load(
        id: id,
        onProgress: (progress) {
          setState(() => _loadProgress = progress);
        },
      );
      _vm.avatar = avatar;
      _avatarViewKey++;
      setState(() => _isLoadingAvatar = false);
    } catch (e) {
      setState(() {
        _loadError = e.toString();
        _isLoadingAvatar = false;
      });
    }
  }
}
