import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:avatar_kit/avatar_kit.dart' hide ConnectionState;

import 'playground_page.dart';

class ConfigurationPage extends StatefulWidget {
  const ConfigurationPage({super.key});

  @override
  State<ConfigurationPage> createState() => _ConfigurationPageState();
}

class _ConfigurationPageState extends State<ConfigurationPage> {
  final _appIdController = TextEditingController();
  final _tokenController = TextEditingController();
  String _selectedEnvironment = 'intl';
  bool _isInitializing = false;
  String? _errorMessage;

  @override
  void initState() {
    super.initState();
    _loadSavedConfig();
  }

  Future<void> _loadSavedConfig() async {
    final prefs = await SharedPreferences.getInstance();
    setState(() {
      _appIdController.text = prefs.getString('appID') ?? '';
      _tokenController.text = prefs.getString('sessionToken') ?? '';
      _selectedEnvironment = prefs.getString('environment') ?? 'intl';
    });
  }

  Future<void> _saveConfig() async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString('appID', _appIdController.text.trim());
    await prefs.setString('sessionToken', _tokenController.text.trim());
    await prefs.setString('environment', _selectedEnvironment);
  }

  bool get _canInit {
    return _appIdController.text.trim().isNotEmpty &&
        _tokenController.text.trim().isNotEmpty &&
        !_isInitializing;
  }

  Future<void> _initialize() async {
    FocusScope.of(context).unfocus();
    setState(() {
      _isInitializing = true;
      _errorMessage = null;
    });

    try {
      final env = _selectedEnvironment == 'cn'
          ? Environment.cn
          : Environment.intl;

      await AvatarSDK.initialize(
        appID: _appIdController.text.trim(),
        configuration: Configuration(
          environment: env,
          audioFormat: const AudioFormat(sampleRate: 16000),
          drivingServiceMode: DrivingServiceMode.sdk,
          logLevel: LogLevel.all,
        ),
      );

      await AvatarSDK.setSessionToken(_tokenController.text.trim());
      await _saveConfig();

      if (mounted) {
        Navigator.of(context).push(
          MaterialPageRoute(builder: (_) => const PlaygroundPage()),
        );
      }
    } catch (e) {
      _errorMessage = e.toString();
    } finally {
      if (mounted) setState(() => _isInitializing = false);
    }
  }

  @override
  void dispose() {
    _appIdController.dispose();
    _tokenController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('SDK Mode'),
        centerTitle: true,
      ),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            // App ID
            const Text('App ID',
                style: TextStyle(fontWeight: FontWeight.w600, color: Colors.grey)),
            const SizedBox(height: 8),
            TextField(
              controller: _appIdController,
              decoration: const InputDecoration(
                hintText: 'Enter App ID',
                border: OutlineInputBorder(),
                isDense: true,
              ),
              style: const TextStyle(fontSize: 14),
              autocorrect: false,
              onChanged: (_) => setState(() {}),
            ),
            const SizedBox(height: 20),

            // Session Token
            const Text('Session Token',
                style: TextStyle(fontWeight: FontWeight.w600, color: Colors.grey)),
            const SizedBox(height: 8),
            TextField(
              controller: _tokenController,
              decoration: const InputDecoration(
                hintText: 'Enter Session Token',
                border: OutlineInputBorder(),
                isDense: true,
              ),
              style: const TextStyle(fontSize: 14),
              autocorrect: false,
              maxLines: 3,
              onChanged: (_) => setState(() {}),
            ),
            const SizedBox(height: 20),

            // Environment
            const Text('Environment',
                style: TextStyle(fontWeight: FontWeight.w600, color: Colors.grey)),
            const SizedBox(height: 8),
            SegmentedButton<String>(
              segments: const [
                ButtonSegment(value: 'intl', label: Text('International')),
                ButtonSegment(value: 'cn', label: Text('China')),
              ],
              selected: {_selectedEnvironment},
              onSelectionChanged: (v) =>
                  setState(() => _selectedEnvironment = v.first),
            ),
            const SizedBox(height: 24),

            // Error
            if (_errorMessage != null) ...[
              Text(
                _errorMessage!,
                style: const TextStyle(color: Colors.red, fontSize: 12),
              ),
              const SizedBox(height: 12),
            ],

            // Initialize button
            FilledButton(
              onPressed: _canInit ? _initialize : null,
              child: _isInitializing
                  ? const SizedBox(
                      height: 20,
                      width: 20,
                      child: CircularProgressIndicator(
                          strokeWidth: 2, color: Colors.white),
                    )
                  : const Text('Initialize SDK'),
            ),
          ],
        ),
      ),
    );
  }
}
