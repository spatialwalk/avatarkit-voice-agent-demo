import 'package:flutter/material.dart';
import 'package:avatar_kit/avatar_kit.dart' hide ConnectionState, Transform;

import 'avatar_view_model.dart';
import 'characters.dart';

class PlaygroundPage extends StatefulWidget {
  const PlaygroundPage({super.key});

  @override
  State<PlaygroundPage> createState() => _PlaygroundPageState();
}

class _PlaygroundPageState extends State<PlaygroundPage> {
  final AvatarViewModel _vm = AvatarViewModel();

  String? _selectedCharacterId;
  bool _isLoadingAvatar = false;
  double _loadProgress = 0;
  String? _loadError;
  bool _showCustomInput = false;
  final TextEditingController _customIdController = TextEditingController();
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
          _buildAvatarSection(),
          _buildStatusBar(),
          _buildControlButtons(),
          const Divider(height: 1),
          Expanded(
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Expanded(
                    child: SingleChildScrollView(
                        child: _buildCharacterSection())),
                const VerticalDivider(width: 1),
                Expanded(
                    child: SingleChildScrollView(
                        child: _buildAudioFileSection())),
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
              const Icon(Icons.cell_tower, size: 14, color: Colors.grey),
              const SizedBox(width: 4),
              Text(
                _vm.connectionState,
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
    final isDisconnected = _vm.connectionState == 'disconnected';

    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 8),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          OutlinedButton(
            onPressed: isDisconnected ? _vm.start : null,
            child: const Text('Start', style: TextStyle(fontSize: 12)),
          ),
          const SizedBox(width: 8),
          OutlinedButton(
            onPressed: _vm.interrupt,
            child: const Text('Interrupt', style: TextStyle(fontSize: 12)),
          ),
          const SizedBox(width: 8),
          OutlinedButton(
            onPressed: !isDisconnected ? _vm.close : null,
            child: const Text('Close', style: TextStyle(fontSize: 12)),
          ),
        ],
      ),
    );
  }

  // --- Audio file section ---

  Widget _buildAudioFileSection() {
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
                  'Audio Files',
                  style: TextStyle(fontSize: 12, color: Colors.grey),
                ),
                const Spacer(),
                if (_vm.isSendingAudio)
                  const SizedBox(
                    width: 14,
                    height: 14,
                    child: CircularProgressIndicator(strokeWidth: 2),
                  ),
              ],
            ),
          ),
          const SizedBox(height: 4),
          ..._vm.audioFiles.map((file) => InkWell(
                onTap: _vm.isSendingAudio ? null : () => _vm.sendAudioFile(file),
                child: Padding(
                  padding:
                      const EdgeInsets.symmetric(horizontal: 12, vertical: 4),
                  child: Row(
                    children: [
                      const Icon(Icons.graphic_eq, size: 14, color: Colors.grey),
                      const SizedBox(width: 6),
                      Expanded(
                        child: Text(
                          file,
                          style: const TextStyle(fontSize: 11),
                          overflow: TextOverflow.ellipsis,
                        ),
                      ),
                      if (_vm.currentlyPlayingFile == file)
                        const Icon(Icons.volume_up,
                            size: 14, color: Colors.blue),
                    ],
                  ),
                ),
              )),
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
          if (_showCustomInput)
            _buildCustomIdInput()
          else
            _buildCustomIdButton(),
          if (_loadError != null)
            Padding(
              padding:
                  const EdgeInsets.symmetric(horizontal: 12, vertical: 4),
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
                style: const TextStyle(
                    color: Colors.white,
                    fontSize: 12,
                    fontWeight: FontWeight.bold),
              ),
            ),
            const SizedBox(width: 8),
            Text(character.name, style: const TextStyle(fontSize: 12)),
            const Spacer(),
            if (isLoading)
              Text(
                '${(_loadProgress * 100).toInt()}%',
                style: const TextStyle(
                    fontSize: 10,
                    color: Colors.blue,
                    fontWeight: FontWeight.w600),
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
                border:
                    Border.all(color: Colors.grey, style: BorderStyle.solid),
              ),
              child: const Center(
                child: Text('+',
                    style: TextStyle(color: Colors.grey, fontSize: 12)),
              ),
            ),
            const SizedBox(width: 8),
            const Text('Custom ID',
                style: TextStyle(fontSize: 12, color: Colors.grey)),
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
              contentPadding:
                  EdgeInsets.symmetric(horizontal: 8, vertical: 8),
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

  // --- Actions ---

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
