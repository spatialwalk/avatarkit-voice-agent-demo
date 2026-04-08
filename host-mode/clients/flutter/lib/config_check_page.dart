import 'dart:convert';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:avatar_kit/avatar_kit.dart' hide ConnectionState;

import 'config.dart';
import 'playground_page.dart';

class ConfigCheckPage extends StatefulWidget {
  const ConfigCheckPage({super.key});

  @override
  State<ConfigCheckPage> createState() => _ConfigCheckPageState();
}

class _ConfigCheckPageState extends State<ConfigCheckPage> {
  bool _checking = false;
  bool _healthOk = false;
  List<String> _missingVars = [];
  String? _errorMessage;

  String? _appId;
  String? _environment;

  @override
  void initState() {
    super.initState();
    _check();
  }

  Future<void> _check() async {
    setState(() {
      _checking = true;
      _healthOk = false;
      _missingVars = [];
      _errorMessage = null;
      _appId = null;
      _environment = null;
    });

    try {
      // Step 1: Check /healthz
      final healthzUrl = Uri.parse('${Config.hostServerURL}/healthz');
      final client = HttpClient();
      client.connectionTimeout = const Duration(seconds: 5);

      final healthReq = await client.getUrl(healthzUrl);
      final healthResp = await healthReq.close();
      final healthBody = await healthResp.transform(utf8.decoder).join();
      final healthJson = jsonDecode(healthBody) as Map<String, dynamic>;

      if (healthJson['ok'] != true) {
        final missing = (healthJson['missing'] as List<dynamic>?)
                ?.map((e) => e.toString())
                .toList() ??
            [];
        setState(() {
          _checking = false;
          _healthOk = false;
          _missingVars = missing;
        });
        client.close();
        return;
      }

      // Step 2: Fetch /api/config
      final configUrl = Uri.parse('${Config.hostServerURL}/api/config');
      final configReq = await client.getUrl(configUrl);
      final configResp = await configReq.close();
      final configBody = await configResp.transform(utf8.decoder).join();
      final configJson = jsonDecode(configBody) as Map<String, dynamic>;

      client.close();

      setState(() {
        _checking = false;
        _healthOk = true;
        _appId = configJson['appId'] as String?;
        _environment = configJson['environment'] as String?;
      });
    } catch (e) {
      setState(() {
        _checking = false;
        _errorMessage = e.toString();
      });
    }
  }

  Future<void> _start() async {
    if (_appId == null) return;

    final env = _resolveEnvironment(_environment);

    await AvatarSDK.initialize(
      appID: _appId!,
      configuration: Configuration(
        environment: env,
        audioFormat: const AudioFormat(sampleRate: 16000),
        drivingServiceMode: DrivingServiceMode.host,
        logLevel: LogLevel.all,
      ),
    );

    if (!mounted) return;
    Navigator.of(context).pushReplacement(
      MaterialPageRoute(builder: (_) => const PlaygroundPage()),
    );
  }

  Environment _resolveEnvironment(String? value) {
    switch (value) {
      case 'intl':
        return Environment.intl;
      case 'cn':
        return Environment.cn;
      default:
        return Environment.intl;
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Server Check'),
        centerTitle: true,
      ),
      body: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            // Guide image
            ClipRRect(
              borderRadius: BorderRadius.circular(10),
              child: Image.asset(
                'assets/api-key-guide.png',
                fit: BoxFit.fitWidth,
              ),
            ),
            const SizedBox(height: 16),
            Text(
              'Host Server',
              style: Theme.of(context).textTheme.titleSmall,
            ),
            const SizedBox(height: 4),
            Text(
              Config.hostServerURL,
              style: const TextStyle(fontSize: 13, color: Colors.grey),
            ),
            const SizedBox(height: 24),

            // Status
            if (_checking)
              const Center(child: CircularProgressIndicator())
            else ...[
              if (_errorMessage != null)
                _buildStatusCard(
                  icon: Icons.error_outline,
                  color: Colors.red,
                  title: 'Connection Error',
                  body: _errorMessage!,
                ),
              if (_missingVars.isNotEmpty)
                _buildStatusCard(
                  icon: Icons.warning_amber_rounded,
                  color: Colors.orange,
                  title: 'Missing Environment Variables',
                  body: _missingVars.join('\n'),
                ),
              if (_healthOk && _appId != null)
                _buildStatusCard(
                  icon: Icons.check_circle_outline,
                  color: Colors.green,
                  title: 'Server Ready',
                  body: 'appId: $_appId\nenvironment: $_environment',
                ),
            ],

            const Spacer(),

            // Buttons
            Row(
              children: [
                Expanded(
                  child: OutlinedButton(
                    onPressed: _checking ? null : _check,
                    child: const Text('Recheck'),
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: FilledButton(
                    onPressed: (_healthOk && _appId != null) ? _start : null,
                    child: const Text('Start'),
                  ),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildStatusCard({
    required IconData icon,
    required Color color,
    required String title,
    required String body,
  }) {
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Icon(icon, color: color, size: 24),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    title,
                    style: TextStyle(
                      fontWeight: FontWeight.w600,
                      color: color,
                    ),
                  ),
                  const SizedBox(height: 4),
                  Text(
                    body,
                    style: const TextStyle(fontSize: 13),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}
