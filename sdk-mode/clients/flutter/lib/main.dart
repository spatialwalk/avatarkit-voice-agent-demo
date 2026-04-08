import 'package:flutter/material.dart';

import 'configuration_page.dart';

void main() {
  WidgetsFlutterBinding.ensureInitialized();
  runApp(const AvatarSdkDemoApp());
}

class AvatarSdkDemoApp extends StatelessWidget {
  const AvatarSdkDemoApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'AvatarKit SDK Demo',
      theme: ThemeData(
        colorSchemeSeed: Colors.blue,
        useMaterial3: true,
      ),
      home: const ConfigurationPage(),
    );
  }
}
