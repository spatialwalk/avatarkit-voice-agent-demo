import 'dart:async';
import 'dart:convert';
import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:record/record.dart';
import 'package:avatar_kit/avatar_kit.dart' as ak;
import 'package:web_socket_channel/web_socket_channel.dart';

import 'config.dart';

class AvatarViewModel extends ChangeNotifier {
  // --- Public state ---
  String connectionState = 'disconnected';
  String conversationState = 'idle';
  String? errorMessage;
  ak.Avatar? avatar;

  bool hostConnected = false;
  bool hostConnecting = false;
  bool hostMicActive = false;

  // --- Private ---
  ak.AvatarController? _controller;
  WebSocketChannel? _wsChannel;
  StreamSubscription? _wsSubscription;
  final Map<String, String> _hostTurnMap = {};

  // Microphone
  final AudioRecorder _recorder = AudioRecorder();
  StreamSubscription? _micSubscription;

  // --- Controller ---

  void setAvatarController(ak.AvatarController controller) {
    _controller = controller;

    controller.onConnectionState = (state, errorMsg) {
      connectionState = state.name;
      if (state == ak.ConnectionState.connected) {
        // no-op for host mode
      }
      notifyListeners();
    };

    controller.onConversationState = (state) {
      conversationState = state.name;
      notifyListeners();
    };

    controller.onError = (error) {
      errorMessage = error.name;
      notifyListeners();
    };
  }

  // --- Lifecycle ---

  void start() => _controller?.start();

  void pause() => _controller?.pause();

  void resume() => _controller?.resume();

  void interrupt() {
    hostStopMic();
    _sendWsMessage({'type': 'interrupt'});
    _hostTurnMap.clear();
    _controller?.interrupt();
  }

  // --- Host Mode: WebSocket ---

  Uri get _hostWsUrl {
    final base = Config.hostServerURL
        .replaceFirst('http://', 'ws://')
        .replaceFirst('https://', 'wss://');
    return Uri.parse('$base/ws/agent');
  }

  void hostConnect() {
    if (_wsChannel != null || hostConnecting) return;
    hostConnecting = true;
    errorMessage = null;
    notifyListeners();

    try {
      final channel = WebSocketChannel.connect(_hostWsUrl);
      _wsChannel = channel;

      _wsSubscription = channel.stream.listen(
        (message) => _handleWsMessage(message as String),
        onError: (error) {
          errorMessage = error.toString();
          _onWsDisconnected();
        },
        onDone: _onWsDisconnected,
      );
    } catch (e) {
      errorMessage = e.toString();
      hostConnecting = false;
      notifyListeners();
    }
  }

  void hostDisconnect() {
    hostStopMic();
    _wsSubscription?.cancel();
    _wsSubscription = null;
    _wsChannel?.sink.close();
    _wsChannel = null;
    hostConnected = false;
    hostConnecting = false;
    _hostTurnMap.clear();
    notifyListeners();
  }

  void _onWsDisconnected() {
    hostConnected = false;
    hostConnecting = false;
    hostMicActive = false;
    _wsChannel = null;
    _wsSubscription = null;
    _hostTurnMap.clear();
    notifyListeners();
  }

  void _sendWsMessage(Map<String, dynamic> msg) {
    _wsChannel?.sink.add(jsonEncode(msg));
  }

  void _handleWsMessage(String text) {
    final json = jsonDecode(text) as Map<String, dynamic>;
    final type = json['type'] as String?;
    if (type == null) return;

    final controller = _controller;
    if (controller == null) return;

    switch (type) {
      case 'ready':
        hostConnected = true;
        hostConnecting = false;
        notifyListeners();
        _sendWsMessage({
          'type': 'set_avatar',
          'avatarId': avatar?.id ?? '',
        });

      case 'avatar_audio':
        final turnId = json['turnId'] as String?;
        if (turnId == null) return;
        final audioB64 = json['audio'] as String? ?? '';
        final audioData =
            audioB64.isEmpty ? Uint8List(0) : base64Decode(audioB64);
        final isLast = json['isLast'] as bool? ?? false;
        controller.yieldAudioData(audioData, end: isLast).then((cid) {
          _hostTurnMap.putIfAbsent(turnId, () => cid);
        });

      case 'avatar_frames':
        final turnId = json['turnId'] as String?;
        final framesArr = json['frames'] as List?;
        if (turnId == null || framesArr == null) return;
        final frames = framesArr
            .cast<String>()
            .map((f) => base64Decode(f))
            .toList();
        final isLast = json['isLast'] as bool? ?? false;
        final cid = _hostTurnMap[turnId];
        if (cid != null && frames.isNotEmpty) {
          controller.yieldAnimations(frames, conversationID: cid);
        }
        if (isLast) {
          _hostTurnMap.remove(turnId);
        }

      case 'interrupt':
        _hostTurnMap.clear();
        controller.interrupt();

      case 'error':
        errorMessage = json['message'] as String? ?? 'Unknown error';
        notifyListeners();
    }
  }

  // --- Host Mode: Microphone ---

  Future<void> hostStartMic() async {
    if (!hostConnected || hostMicActive) return;

    final hasPermission = await _recorder.hasPermission();
    if (!hasPermission) {
      errorMessage = 'Microphone permission denied';
      notifyListeners();
      return;
    }

    final stream = await _recorder.startStream(
      const RecordConfig(
        encoder: AudioEncoder.pcm16bits,
        sampleRate: 16000,
        numChannels: 1,
        autoGain: true,
        echoCancel: true,
        noiseSuppress: true,
      ),
    );

    hostMicActive = true;
    notifyListeners();

    _micSubscription = stream.listen((data) {
      if (_wsChannel == null) return;
      final b64 = base64Encode(data);
      _sendWsMessage({'type': 'mic_audio', 'audio': b64});
    });
  }

  void hostStopMic() {
    if (!hostMicActive) return;
    _micSubscription?.cancel();
    _micSubscription = null;
    _recorder.stop();
    hostMicActive = false;
    _sendWsMessage({'type': 'mic_end'});
    notifyListeners();
  }

  // --- Host Mode: Text ---

  void hostSendText(String text) {
    final trimmed = text.trim();
    if (trimmed.isEmpty) return;

    if (!hostConnected && !hostConnecting) {
      hostConnect();
    }

    // If already connected, send immediately; otherwise wait
    if (hostConnected && _wsChannel != null) {
      _sendWsMessage({'type': 'text_query', 'text': trimmed});
    } else {
      // Poll for connection (up to 3s)
      _waitAndSendText(trimmed);
    }
  }

  Future<void> _waitAndSendText(String text) async {
    for (var i = 0; i < 30; i++) {
      if (hostConnected) break;
      await Future.delayed(const Duration(milliseconds: 100));
    }
    if (hostConnected && _wsChannel != null) {
      _sendWsMessage({'type': 'text_query', 'text': text});
    }
  }

  // --- Cleanup ---

  void close() {
    hostDisconnect();
    _controller?.close();
  }

  @override
  void dispose() {
    close();
    _recorder.dispose();
    super.dispose();
  }
}
