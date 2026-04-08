import 'dart:async';
import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart' show rootBundle;
import 'package:avatar_kit/avatar_kit.dart' as ak;

const _audioFiles = [
  'demo_pcm_audio1.pcm',
  'demo_pcm_audio2.pcm',
  'demo_pcm_audio3.pcm',
  'speech.pcm',
];

class AvatarViewModel extends ChangeNotifier {
  // --- Public state ---
  String connectionState = 'disconnected';
  String conversationState = 'idle';
  String? errorMessage;
  ak.Avatar? avatar;
  bool isSendingAudio = false;
  String? currentlyPlayingFile;

  List<String> get audioFiles => _audioFiles;

  // --- Private ---
  ak.AvatarController? _controller;
  bool _isConnected = false;
  Completer<void>? _sendCanceller;

  // --- Controller ---

  void setAvatarController(ak.AvatarController controller) {
    _controller = controller;

    controller.onConnectionState = (state, errorMsg) {
      connectionState = state.name;
      _isConnected = state == ak.ConnectionState.connected;
      if (state == ak.ConnectionState.disconnected ||
          state == ak.ConnectionState.failed) {
        _cancelSending();
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
    _cancelSending();
    _controller?.interrupt();
  }

  void close() {
    _cancelSending();
    _controller?.close();
  }

  // --- Audio file sending ---

  Future<void> sendAudioFile(String filename) async {
    final controller = _controller;
    if (controller == null || !_isConnected) return;

    _cancelSending();
    controller.interrupt();

    Uint8List audioData;
    try {
      final byteData = await rootBundle.load('assets/$filename');
      audioData = byteData.buffer.asUint8List();
    } catch (e) {
      errorMessage = 'Cannot read $filename';
      notifyListeners();
      return;
    }

    isSendingAudio = true;
    currentlyPlayingFile = filename;
    notifyListeners();

    final canceller = Completer<void>();
    _sendCanceller = canceller;

    // 1 second of 16kHz 16-bit mono = 32000 bytes
    const chunkSize = 32000;
    var offset = 0;

    while (offset < audioData.length && !canceller.isCompleted && _isConnected) {
      final end = (offset + chunkSize).clamp(0, audioData.length);
      final isLast = end >= audioData.length;
      final chunk = audioData.sublist(offset, end);
      controller.send(chunk, end: isLast);
      offset = end;
      if (!isLast) {
        await Future.delayed(const Duration(milliseconds: 100));
      }
    }

    if (!canceller.isCompleted) {
      isSendingAudio = false;
      currentlyPlayingFile = null;
      notifyListeners();
    }
  }

  void _cancelSending() {
    _sendCanceller?.complete();
    _sendCanceller = null;
    isSendingAudio = false;
    currentlyPlayingFile = null;
  }

  @override
  void dispose() {
    close();
    super.dispose();
  }
}
